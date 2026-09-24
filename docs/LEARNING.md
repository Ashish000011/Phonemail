# Learning notes

Written by the AI assistant for Ashish after every phase, in plain English: what was
built, how it works, why it's built this way, and questions judges might ask
(with answers). Read each new section right after its phase. For anything
unclear, ask the AI assistant to explain it.

---

## Phase 0: the skeleton (scaffold and Docker)

### What was built
A monorepo (one Git repo, three npm "workspaces"):
- `packages/shared`: zod schemas and constants both sides use. Example:
  `publicConfigSchema` describes what `GET /api/config` returns; the server
  builds it and the web app validates it with the same schema.
- `apps/server`: one TypeScript codebase with four entrypoints in
  `src/entry/`: `api.ts` (REST API), `smtp.ts` (mail server, a stub until
  Phase 2), `worker.ts` (background jobs) and `migrate-and-seed.ts`
  (database setup).
- `apps/web`: the React app. Every screen is a placeholder for now, but it
  already talks to the API and switches between English, Hindi and Tamil.

### The containers and why each exists
| Container | Plain words |
|---|---|
| web (nginx) | The front door. Serves the React files and forwards `/api`, `/socket.io` and `/webhooks` to the api. Adds security headers. |
| api | Answers the app's questions (Fastify). |
| smtp | Our own post office for `@phonemail.com`: other mail servers hand letters to it on port 2525. |
| worker | Does slow jobs in the background (sending SMS, relaying mail) so the API stays fast. |
| migrate | Runs once at startup: creates/updates the database tables, loads demo data, then exits. The others wait for it. |
| postgres | The permanent data (users, emails). |
| redis | Fast short-lived data: OTP codes, rate-limit counters, job queues, live events. |
| mailpit | A fake outside world: mail to gmail.com etc. lands here in demo mode so nothing leaves your laptop. |
| cloudflared | Optional. Gives a public https:// address so a phone and Twilio can reach your laptop. |

api, smtp, worker and migrate are the **same Docker image** started with
different commands. One build, four jobs, shared code.

### How one request travels
```
Browser ──> web (nginx :8080) ──/api/*──> api (:3000) ──> postgres / redis
                 └── anything else ──> index.html (the React app)
```
nginx's `try_files … /index.html` is the "SPA fallback": `/m/chat/42` has no
file on disk, so nginx returns index.html and React Router shows the right
screen.

### Why it's built this way
- **`docker compose up -d` with no .env**: every setting has a safe default
  (`${VAR:-default}` in compose, zod defaults in `config/env.ts`). Judges run
  one command and it works.
- **Healthchecks + `depends_on` conditions**: api waits until Postgres and
  Redis are healthy *and* migrate has finished, so it never starts against an
  empty database.
- **Non-root containers**: if someone broke into a container they wouldn't be
  root inside it.
- **CSRF header**: every POST/PATCH/DELETE to `/api` must carry
  `X-Requested-With: phonemail`. A malicious site can make your browser send a
  form, but it can't add custom headers, so its request is rejected (403).
- **Provider summary at startup**: every service logs which SMS providers are
  active, how OTP codes will travel and which sign-in mode results. One look
  at the logs explains the setup.

### Judge questions
1. **Why one image for four services?** They share all the business logic
   (addressing, mail pipeline). One codebase, one build, different commands.
   That's separation of concerns at runtime without duplicating code.
2. **What happens if Postgres is slow to start?** Compose waits for its
   healthcheck (`pg_isready`), then runs migrate; api/smtp/worker start only
   after migrate exits successfully.
3. **Why nginx in front instead of serving the React app from Node?** nginx
   is built for static files, gzip, caching and WebSocket proxying, and it
   gives us one origin (`localhost:8080`) for the app and the API, so cookies
   and CORS stay simple.
4. **How do you know the system is healthy?** `/api/health` checks Postgres
   and Redis, `/api/ready` also checks the schema is migrated, each container
   has a Docker healthcheck, and `./scripts/smoke.sh` tests the whole chain.
5. **How do you stop cross-site request forgery?** The custom header check
   above, plus SameSite cookies (Phase 1).

---

## Phase 1: accounts, sign-in and the registration portal

### What was built
- **The database** (`apps/server/prisma/schema.prisma`): users, aliases,
  sessions, conversations, messages, mailbox entries, attachments, drafts,
  blocked senders, SMS log and an audit log. Postgres keeps a search index
  for every email up to date by itself (a *generated column*), so search
  needs no extra code.
- **Addressing** (`modules/addressing`): `+91 98765-43210`, `09876543210`
  and `98765 43210` all become `+919876543210` and the address
  `9876543210@phonemail.com`. Other countries get `00` + country code
  (`0014155550123@…`). Landlines are refused.
- **OTP codes** (`modules/auth/otp.ts`), **SMS providers**
  (`providers/sms`), **sessions** (`modules/auth/sessions.ts`), profile,
  aliases, the **portal** at `/register` and the **demo console** at `/demo`.
- **API docs** at `/api/docs`, generated from the same zod schemas that
  validate every request.

### How a sign-in code works
```
1. POST /api/auth/otp/request {phone}
   ├─ normalize the number (+919876543210)
   ├─ limits: 30 s between codes, 5 codes/number/hour, 20 requests/IP/hour
   ├─ make a random 6-digit code
   ├─ store only HMAC(pepper, "login:+91…:123456") in Redis for 5 minutes
   └─ send the SMS through the first provider that can (SMSGate → Twilio → console)
2. POST /api/auth/otp/verify {phone, code}
   ├─ recompute the HMAC and compare in constant time
   ├─ wrong: attempts + 1; after 5 the code is destroyed
   ├─ right: delete the code (it works once), create the account if new
   └─ start a session: set two cookies
```
**Why it's secure:** the code is never stored, only a keyed hash, so even a
copy of Redis doesn't reveal it. It expires in 5 minutes, allows 5 guesses,
and the limits stop someone from spamming codes or guessing at scale.

### Cookies vs tokens
We use both: the *tokens* live *inside* httpOnly *cookies*.
- `pm_at` (access, 15 minutes): a signed JWT saying "user X, session Y".
- `pm_rt` (refresh, 30 days): a random string. The database stores only its
  SHA-256 hash. Every refresh swaps it for a new one ("rotation"). If an old
  one is ever used again, someone copied it, so the whole session is
  revoked.
- httpOnly means page JavaScript can't read them, so a malicious script
  can't steal them. SameSite=Lax plus our `X-Requested-With` header stops
  other websites from using them.
- Why not localStorage? Anything in localStorage is readable by any script
  on the page.

### How the OTP path is chosen (`config/providers.ts`)
1. A provider that can send our own text (SMSGate, or a paid Twilio) → our
   code by real SMS. The last line `@host #123456` lets Chrome on Android
   fill it in automatically.
2. Else Twilio Verify, if configured → Twilio makes and checks the code.
3. Else demo mode → the code shows in the demo console and a banner.
4. Else → password mode.
The Twilio *trial* only sends fixed templates, so it can never carry a code.
Every service logs its choice at startup ("provider summary").

### Judge questions
1. **What stops someone guessing a code?** 5 wrong tries destroy it, a new
   code needs 30 s, max 5 codes per number and 20 per IP per hour. That's at
   most 25 guesses an hour out of a million combinations.
2. **What if your database leaks?** Codes are only HMAC hashes (with a
   secret pepper) in Redis, refresh tokens are SHA-256 hashes, passwords
   are argon2id. None can be used directly.
3. **How do you detect a stolen session?** Refresh tokens rotate on every
   use; if an already-used one comes back, we revoke that session and log
   an audit event.
4. **Why does the portal set no cookies?** It's registration only, like a
   kiosk: the next person must not end up signed in as the previous one.
5. **What happens without any SMS provider?** Demo mode shows codes in the
   demo console; with demo mode off, the app switches to passwords
   automatically and says so at startup.

---

## Phase 2: the mail engine

### What SMTP is
SMTP is the language mail servers use to hand emails to each other. A short
conversation on port 25 (ours: 2525):
```
them: EHLO gmail.com
us:   250 phonemail.com
them: MAIL FROM:<x@gmail.com>
them: RCPT TO:<9876543210@phonemail.com>     ← we check this user exists
them: DATA … the email …
us:   250 Ok: stored as …                    ← only after it's safely saved
```
Because we run a real SMTP server, *any* mail program in the world can
deliver to a PhoneMail address. That's what makes it real email, not a chat
app pretending.

### The journey of one email
```
You tap Send
  → POST /api/messages          checks the rules (locked recipients, reply once…)
  → our SMTP server (as you)     logged in with a 5-minute token only the api can make
  → ingest pipeline (ingest.ts)
       1. save the raw .eml file
       2. parse it (mailparser), make HTML safe (sanitize-html)
       3. work out the thread (Message-ID, In-Reply-To, References)
       4. find local recipients (the envelope includes Bcc)
       5. ONE database transaction: the Message, plus one MailboxEntry per
          person (your "sent" copy, their "received" copy), each filed into
          the right chat by the keying rule
  → after commit: live events (Redis), relay job if someone is outside PhoneMail
  → worker hands outside mail to the relay (Mailpit in demo mode)
```
Mail from outside skips the first two steps and enters at "our SMTP server".
One pipeline for everything means one place to get right.

### Message-ID, In-Reply-To, References
Every email has a unique `Message-ID` like `<3f2a…@phonemail.com>`. A reply
says `In-Reply-To: <that id>` and lists the whole chain in `References`. We
use the first id in References as the thread id, so a conversation stays one
thread in the Gmail view, and In-Reply-To links the reply bubble to its
parent in the chat view. Gmail and Outlook do the same, so threads survive
round trips through other mail apps.

### Why sanitizing matters
An email is HTML written by a stranger. Without cleaning, it could run
JavaScript in our page (steal your session), show a fake login form, or load
a tracking pixel that tells the sender you opened it. We:
1. clean it on arrival: no scripts, event handlers, `javascript:` links,
   iframes, forms or CSS `url()`; remote images are parked (`data-remote-src`)
   until you tap "Show images";
2. show it only inside a sandboxed iframe with a script-blocking policy.
Both would have to fail at once for an attack to work.

### Not an open relay
An "open relay" sends mail anywhere for anyone, and spammers love those. Our
server accepts mail from strangers **only for PhoneMail users**. Sending
anywhere else requires logging in, and only our api can log in.
Anyone else gets `550 Relaying denied`.

### Judge questions
1. **Can Gmail really send to 9876543210@phonemail.com?** Yes, if DNS
   pointed our domain's MX record at this server. Locally we show it with
   `send-test-email` and the demo console, which speak real SMTP to port 2525.
2. **What stops two replies to the same email?** The server checks the
   user's copy (`repliedAt`) and returns 422 ALREADY_REPLIED; a 60-second
   lock catches a double tap before the first reply is stored.
3. **Where's the email stored?** Raw bytes as an .eml file on the maildata
   volume; parsed fields in Postgres. Each person gets their own
   MailboxEntry (read, starred, trashed), so deleting yours doesn't delete
   theirs.
4. **How does spam detection work?** A small points system you can read in
   one screen (`spam.ts`): unknown outside sender +3, many links +2, shouting
   subject +2, scam phrases +3, known sender −5. 5 or more means Spam. Report
   spam blocks the sender.
5. **What happens if the outside mail server is down?** The worker retries
   with growing waits; after the last try the email gets a red "failed" mark
   and you get a notice explaining which address failed.

---

## Phase 3: chats, live updates and SMS alerts

### How emails become chats
Every copy of an email (a MailboxEntry) belongs to exactly one chat of its
owner. Which chat? Take everyone in From, To and Cc, remove yourself, and
what's left is the chat's "participant set":
```
Arjun → me              →  {Arjun}           1:1 chat
me → Arjun, Meera       →  {Arjun, Meera}    group chat
Meera → me, cc Arjun    →  {Arjun, Meera}    the SAME group chat
me → Arjun (later)      →  {Arjun}           back in the 1:1 chat
```
The set is sorted and hashed (SHA-256) into `participantKeyHash`; the
database has a unique index on (owner, hash), so the same people always land
in the same chat. Bcc never counts: if you were only Bcc'd, the email goes
to your 1:1 chat with the sender.

### Why aliases collapse into one person
Arjun can write from `9000000002@`, `arjun@` or `9000000002+work@`. All
three resolve to his user id, so his "identity key" is `u:<his id>` every
time and it's still one chat. People outside PhoneMail are identified by
their address (`e:x@gmail.com`).

### How live updates work
```
smtp/worker/api ──publish──▶ Redis channel "events" ──▶ api ──Socket.IO──▶ your browser
```
The smtp service stores an email, then publishes "mail.delivered for user
X". The api (the only process holding sockets) turns that into a
`message:new` event with the ready-to-draw chat row and bubble, and sends it
to room `user:X`. Sockets sign in with the same httpOnly cookie as the REST
API, and each joins only its own room.

### The SMS rule
"Only for users who don't have the mobile app" becomes: **send an SMS
when an email arrives, unless the user has an active mobile session.**
- Signing in on the phone app creates a mobile session, so texts stop.
- Signing out of every mobile session starts them again.
- Checked twice: when the email arrives (spam, system mail, own email?) and
  again in the worker just before sending (maybe they just opened the app).
- The text is exactly the task's sentence, kept to one SMS segment: 160
  characters normally, 70 if the name or subject is in Hindi or Tamil.

Seed data shows both sides: emailing Arjun (web only) produces an SMS in
the demo console; emailing Priya (mobile app) doesn't.

### Blue ticks
One grey tick = our SMTP server accepted it. Two grey = every PhoneMail
recipient has it (same database transaction, so it's instant). Two blue =
every recipient opened the chat, and both sides allow read receipts
(a privacy toggle in Settings).

### Judge questions
1. **Why is the chat decided by the people and not by the email thread?**
   The task says all emails from the same sender stay in one chat. Threads
   still exist: replies are linked to their parent (quoted in the bubble),
   and the Gmail view groups by thread.
2. **What if an outside mail app replies only to me from a group email?**
   The people in that reply are just the sender, so it lands in the 1:1 chat;
   the bubble still quotes the original and says which group it came from.
3. **Why Redis pub/sub instead of the smtp service sending socket events?**
   Only the api has the sockets. Redis lets any process announce events, and
   it would still work with several api containers.
4. **How do you avoid texting someone who has the app?** The worker checks
   for an active mobile session right before sending, not only when the
   email arrived.
5. **Why queue SMS alerts instead of sending right away?** Receiving mail
   must stay fast and must never fail because an SMS provider is slow or
   down. The queue retries with growing waits and logs every attempt.

---

## Phase 6: sign-up by phone call and by SMS

### What IVR and TwiML are
IVR (Interactive Voice Response) is "press 1 for…". Twilio answers the call
and asks *our server* what to do by POSTing to a webhook. We reply with
TwiML, a small XML language:
```xml
<Response>
  <Gather numDigits="1" action="/webhooks/twilio/voice/menu">
    <Say>Welcome to PhoneMail… To create your free account, press 1.</Say>
  </Gather>
  <Redirect>/webhooks/twilio/voice?retry=1</Redirect>
</Response>
```
Twilio reads the text aloud, waits for a key, and POSTs the key (`Digits=1`)
and the caller's number (`From`) to the action URL. We create the account
and answer with more TwiML that reads the address digit by digit.

### How webhooks and the tunnel work
Twilio lives on the internet; our laptop doesn't have a public address.
`cloudflared` opens a tunnel from Cloudflare to our nginx and gives us a
`https://….trycloudflare.com` URL. `public-url.sh` saves that URL and tells
Twilio and SMSGate to call it.
```
caller → Twilio → https://xyz.trycloudflare.com/webhooks/twilio/voice
                   → cloudflared → nginx → api → TwiML back to Twilio
```

### Why signature validation matters
Anyone who knows the webhook URL could POST "From=+91… Digits=1" and create
accounts for other people's numbers. Twilio signs every request with our
secret auth token (HMAC-SHA1 over the URL and parameters). We recompute the
signature and refuse anything that doesn't match. SMSGate calls a secret URL
and can also sign its requests.

### SMS sign-up on a personal phone
The SMSGate phone is your own phone, which also gets bank OTPs and
messages from friends. So on that channel:
- only texts starting with **JOIN** (or HELP) do anything;
- senders that aren't phone numbers (VM-HDFCBK) are ignored;
- ignored texts are never stored or logged.
The Twilio number exists only for PhoneMail, so any text there signs you up.

### The Twilio trial limits (design around them)
- Calls and texts only to/from **verified** numbers (max 5).
- SMS bodies must be one of Twilio's templates, so alerts on Twilio are a
  template and codes go by SMSGate or the demo console instead.
- TwiML must answer within 5 seconds: we create the account (fast) and put
  the confirmation SMS on the queue.
- Use a US *local* number; toll-free US numbers can't be dialled from India.
  "Call me" avoids international call charges altogether.

### Judge questions
1. **Is it really toll-free?** No: a Twilio trial can't get an Indian
   toll-free number, and US toll-free numbers can't be reached from India. We
   use the trial's US number, and "Call me" makes Twilio call you instead.
   The IVR flow is identical.
2. **What stops someone creating accounts for random numbers through the
   webhook?** Twilio's signature. Without our auth token nobody can make a
   valid one; unsigned requests get 403.
3. **What if Twilio's SMS doesn't reach Indian numbers?** SMS goes through a
   chain: SMSGate first, then Twilio, then the demo console. Every attempt,
   failed or not, is in the SMS log and the demo console.
4. **What happens if the same person calls twice?** Account creation is
   idempotent: the second call hears "You already have a PhoneMail account"
   and their address.
5. **Can you demo without a phone?** Yes. The demo console's simulators run
   the exact same code as the webhooks and show what the caller would hear.

---

## Phase 4: the mobile app, part 1 (onboarding and Home)

### How the screens are built
```
apps/web/src/mobile/
  MobileShell.tsx      the phone-width column, live updates, toasts, announcer
  onboarding/          Language → Terms → Phone → Verify (+ contacts sheet)
  home/                HomeScreen, ChatRow, SearchResults, MenuDrawer
  folders/             Drafts, Spam, Trash
  ui/                  TopBar, IconButton, BottomSheet, Dialog, Avatar, Ticks…
  live.tsx             Socket.IO → cache updates, "Waiting for network…"
```
Small primitives (ui/) are reused everywhere, so every screen gets the same
focus handling, labels and motion rules for free.

### How TanStack Query and Socket.IO keep screens fresh
- TanStack Query caches every API answer under a key, e.g.
  `['conversations', 'all']` or `['messages', chatId]`. Screens read the cache
  and it refetches when stale.
- When the server says `message:new`, `live.tsx` edits the cache directly: the
  chat jumps to the top of the list and the bubble is appended to that
  chat's messages. No refetch, so it appears instantly.
- After a reconnect we refetch everything once, to catch events we missed.

### How the OTP auto-detection works
Three ways, all on the same input `autocomplete="one-time-code"`:
1. **Android Chrome (WebOTP):** our SMS ends with `@yourhost #123456`. The
   page calls `navigator.credentials.get({ otp: … })`; Chrome shows "Allow
   PhoneMail to read this code?" and hands us the digits. We cancel the wait
   (AbortController) if you leave the screen.
2. **iPhone Safari:** the keyboard suggests the code from Messages.
3. **APK (stretch):** the SMS User Consent API.
The sixth digit submits automatically.

### Accessibility built in from the start
- Every icon button has a label (the component won't compile without one).
- Sheets and dialogs trap focus, close on Escape, and give focus back.
- Long-press has keyboard and mouse equivalents (Menu key / right-click).
- New emails are announced through a live region; ticks have spoken labels.
- The muted grey was darkened to pass 4.5:1 contrast.
- `prefers-reduced-motion` turns the slide animations off.

### Judge questions
1. **Why a web app and not a native app?** The organizers allowed it, and
   it installs to the home screen as a PWA (icon, full screen). An APK via
   Capacitor is a stretch goal on top of the same code.
2. **How does it know my number?** On the web, browsers don't expose the SIM.
   We pre-fill from the `?phone=` link in the welcome SMS or from Chrome's
   autofill, and the field always stays editable. The APK could read it.
3. **What if the internet drops?** A "Waiting for network…" banner appears;
   when the socket reconnects, every visible list refetches.
4. **How does the app stay signed in?** The 15-minute access cookie is
   renewed automatically: the first request that gets 401 refreshes once
   (shared by all requests) and retries.
5. **Hindi and Tamil?** Every string comes from en/hi/ta JSON files, a test
   fails if any key is missing, and Noto fonts load only when those scripts
   appear on screen.

## Phase 5a: the chat screen

### How a chat screen is put together
```
apps/web/src/mobile/chat/
  ChatScreen.tsx     loads the chat, groups by day, scrolling, send, drafts
  Bubble.tsx         one email as a bubble: tail, quote, subject, files, ticks
  ChatInput.tsx      subject + message box, reply bar, emoji, attach
  MessageActions.tsx the long-press sheet (reply, star, copy, info, trash)
  EmojiGrid.tsx      the emoji sheet
  wallpaper.ts       the doodle background as an inline SVG
```
`ChatScreen` waits for the chat and the first page of emails, then mounts
`ChatView` with `key={id}`. So opening another chat starts from a clean
slate (scroll position, reply target, unread divider) without any reset code.

### Scrolling, the part that is easy to get wrong
- **Opening:** jump to the linked email (`?focus=`), else the "N unread
  emails" divider, else the bottom.
- **Older emails:** near the top we fetch the page before the oldest one
  (`before=` cursor). Before it arrives we note the scroll height; after it
  renders we add the difference, so what you were reading doesn't move.
- **New emails:** follow them only if you were already near the bottom.
  Otherwise a "scroll down" button appears with a count.
- These run in `useLayoutEffect`, which runs before the browser paints, so
  there is no visible jump.

### Why each day is its own section
Date labels are `position: sticky`. If they all share one list, the labels
pile on top of each other at the top. Each day gets its own section, so its
label sticks only while that day is on screen, like WhatsApp.

### Optimistic sending
Pressing send shows the bubble right away with a clock icon (a temporary id).
When the server answers, the real bubble arrives through Socket.IO (or a
refetch if the event was missed) and the temporary one is removed. On
failure the text goes back into the box and a toast explains why.

### Reply once
Each email can be answered once from the chat, so the chat stays a clean
back-and-forth. The client hides Reply (swipe resists, the sheet leaves it
out) and the server returns 422 if someone tries anyway. You can still
open the email in full view.

### Judge questions
1. **Is a bubble really an email?** Yes. It has a subject, a Message-ID,
   and `In-Reply-To`/`References` when it is a reply, so Gmail threads it
   correctly. Info on the long-press sheet shows the headers.
2. **What about long emails and HTML?** Bubbles show the plain-text part,
   cut after 12 lines with "Read more". The full email, HTML included, opens
   in the reader view (Phase 5b) in a sandboxed iframe.
3. **How does it stay smooth with hundreds of emails?** It loads 40 at a
   time, and loads older pages only when you scroll up.
4. **Accessible without swiping?** Every bubble can take keyboard focus.
   Enter opens it, the Menu key or right-click opens the actions, and the
   actions include Reply.

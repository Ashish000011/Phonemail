# Build plan: phases and prompts

## Before you start (once, ~30 minutes)
1. Install Git, Node.js 22 LTS, Docker Desktop and an AI coding assistant (signed in to your plan).
   - On Windows, use WSL2 (Ubuntu) for everything. Keep the project in the
     Linux home folder (`~/phonemail`), not under `/mnt/c`, so Docker and npm
     stay fast and line endings stay LF.
2. Create the repo and add this kit:
   ```
   mkdir phonemail && cd phonemail && git init
   # copy docs/ and .gitattributes from the kit here
   git add -A && git commit -m "docs: project spec and build plan"
   ```
   Create an empty GitHub repo, add it as `origin`, push. Push after every phase.
3. Start the AI assistant in that folder.

## How to run a phase
1. `/clear` for a fresh context (skip before Phase 0).
2. Switch to plan mode: Shift+Tab until it shows plan mode (or type `/plan`).
3. Type `/phase 0` (or the phase number), or paste the prompt from below.
4. Read the plan. If it misses something from the phase, say so. Approve.
5. Let it build and answer its questions. At the end it runs the checks,
   updates PROGRESS.md and LEARNING.md, commits and tags.
6. Read the new LEARNING.md section yourself (10 minutes). Anything unclear:
   `/explain <topic>`. Judges will ask you these things.
7. Try the feature by hand for 5 minutes, then `git push`.

## Staying within the AI plan's limits
- chat and coding sessions draw from the same usage, so build in the coding
  tool and keep chats short (a new chat per question).
- The plan's usage page shows what's left. Start heavy phases right after a
  reset.
- `/clear` between phases; `/compact` if one phase runs long.
- Paste only the last ~30 lines of an error, not whole logs.
- If you hit the limit: use the break to test by hand, read LEARNING.md,
  prepare the demo, or pick one of the provider's options (wait for the reset,
  usage credits, or a bigger plan). Your call.

## When something goes wrong
- Small bug: tell the AI assistant what you did, what you expected, what happened,
  and the exact error text.
- Big mess: `git reset --hard phase-<last good>`, `/clear`, rerun the phase
  with a narrower prompt. The assistant can also rewind the
  conversation.
- Over time: every phase has a cut list. Cut, commit, move on. A finished
  smaller feature beats an unfinished bigger one.

## Schedule
| Day | AI assistant | You, in parallel |
|---|---|---|
| 1 | Phase 0 (scaffold), Phase 1 (auth + portal) | Twilio trial sign-up, verify your number, test one call and one template SMS to your Indian number |
| 2 | Phase 2 (mail engine), Phase 3 (chats, realtime, SMS alerts) | Test by hand, read LEARNING.md |
| 3 | Phase 4 (mobile onboarding + home), Phase 5 (mobile chat + settings) | Try it on your phone through the tunnel |
| 4 | Phase 6 (IVR + SMS signup), Phase 7 (web client) | Real Twilio call test; ask a Tamil/Hindi speaker to glance at strings |
| 5 | Phase 8 (hardening), Phase 9 (docs + fresh-clone test); Phase 10 only if all green | Demo video, slides, two timed rehearsals |
Feature freeze: Day 5, 1 pm. After that only fixes and docs.

---

## Phase 0: Scaffold and Docker skeleton (Day 1, ~2.5h)
Reads: 00-overview.md, 01-architecture.md
```
Phase 0. Build the project skeleton exactly as described in
docs/spec/01-architecture.md.
- npm workspaces: apps/server, apps/web, packages/shared. TypeScript strict,
  ESLint + Prettier, a shared tsconfig base, root scripts: build, typecheck,
  lint, test, dev.
- apps/server: Fastify with /api/health (checks Postgres and Redis) and
  /api/config; env loading with zod (every variable in the spec with demo
  defaults, warnings for default secrets when DEMO_MODE=false); pino logger;
  Prisma wired up with an initial migration; the three entrypoints (api, smtp,
  worker) start and log the provider summary. smtp may be a stub that accepts
  connections for now.
- apps/web: Vite + React 19 + TypeScript + Tailwind v4 + React Router +
  TanStack Query + i18next (en/hi/ta files with a few keys). Routes /m, /mail,
  /login, /register, /demo, /terms, /privacy as placeholders; "/" redirects by
  device as the spec says.
- packages/shared: zod and one sample schema used by both apps.
- Dockerfiles (multi-stage, node:22-slim, non-root) and docker-compose.yml with
  every service from the spec, healthchecks, depends_on conditions, volumes,
  the migrate one-shot, Mailpit, and cloudflared under profile "public". It
  must work with no .env (defaults inline with ${VAR:-default}).
- nginx for web: SPA fallback; proxy /api, /socket.io (websocket) and
  /webhooks to api; security headers; caching rules.
- .env.example documenting every variable; .gitignore; keep the existing
  .gitattributes; README stub with the quick start.
- scripts/smoke.sh: waits for health, checks /api/health and /api/config.
Done when: `docker compose up -d --build` from a clean checkout gets every
service healthy, http://localhost:8080 shows the placeholder app,
./scripts/smoke.sh passes, typecheck and lint pass.
Then update docs/PROGRESS.md, append to docs/LEARNING.md (what each container
does and why, how a request flows through nginx, 5 judge questions with
answers), commit and tag phase-0.
```
Cut if late: Prettier tuning, CI.

## Phase 1: Data model, auth, registration portal (Day 1, ~4h)
Reads: 02-data-model.md, 03-auth-and-accounts.md, the provider part of 06
```
Phase 1. Data model and authentication.
- Prisma schema with every model in docs/spec/02-data-model.md, including the
  search vector through a raw SQL migration (generated column or trigger), and
  an idempotent migrate-and-seed entry (seed can be minimal for now).
- modules/addressing: phone normalization, primary address rules, alias
  validation, identity keys, with unit tests for every rule in the spec.
- providers/sms: the interface, console, twilio (trial template mode) and
  smsgate adapters, and the provider chain writing SmsLog.
  providers/otp: local and twilio-verify, plus the OTP path resolver from 03.
- modules/auth: OTP service in Redis (hashing, TTL, attempts, cooldown, number
  and IP limits), AUTH_MODE resolution, password auth (@node-rs/argon2),
  sessions with access + rotating refresh cookies and reuse detection, the CSRF
  header check, every route in 03 including /api/me, sessions and aliases.
  Unit tests for OTP limits and expiry.
- modules/accounts: createAccount() for every channel, AuthEvents, and a TODO
  hook for the welcome email (the mail engine comes in Phase 2).
- The registration portal at /register exactly as docs/spec/08-web-ui.md
  describes (two fields, one button, success state, fields reset), styled
  cleanly with the brand tokens from 07, with the demo code banner.
- Demo console v1 at /demo: OTP/SMS feed from SmsLog (polling is fine for now)
  and the users table.
Done when: an account can be created on /register with the demo code, it shows
in the demo console, the fields reset, unit tests pass, and docker compose
still comes up clean.
Then update PROGRESS.md, append to LEARNING.md (how the OTP flow works and why
it's secure, cookies vs tokens, how the OTP path is chosen, 5 judge
questions), commit and tag phase-1.
```
Cut if late: twilio-verify adapter, sessions list endpoint.

## Phase 2: Mail engine (Day 2, ~4h)
Reads: 04-mail-engine.md, the keying rule in 05-conversations.md
```
Phase 2. Build the mail engine from docs/spec/04-mail-engine.md.
- smtp entry: smtp-server on 2525 with the auth rules (internal user tokens),
  relay denial, recipient validation, size and connection limits.
- The ingest pipeline as one well-tested module: raw storage, parsing,
  sanitizing, threading, recipient resolution (primary, alias, plus address),
  storage, mailbox entries, and conversation assignment with the keying rule
  from docs/spec/05-conversations.md (implement the keying function now, with
  the full example table as unit tests).
- POST /api/messages with every rule (phone numbers or emails as recipients,
  RECIPIENTS_LOCKED, ALREADY_REPLIED, Re: subjects), MIME building with
  nodemailer, submission to the smtp service.
- Attachment upload/download with the security rules. Drafts CRUD.
- Folder endpoints, flags, trash/restore/delete-forever/empty, spam/not-spam
  with BlockedSender, the search endpoint with phone-number detection.
- Worker: outbound relay queue (Mailpit by default) with retries and the
  delivery-failure notice; daily trash purge; purge of unsent uploads.
- The welcome email from Phase 1 now goes through the real pipeline.
- scripts/send-test-email.ts: sends an email to a PhoneMail address over SMTP
  from an outside address.
- Integration tests: A→B via the API, outside sender → PhoneMail over SMTP,
  relay denied, reply-once 422.
Done when: tests pass; smoke.sh also sends an outside email over SMTP and
confirms it through the API; an email to an outside address shows up in
Mailpit at http://localhost:8025.
Then update PROGRESS.md, append to LEARNING.md (what SMTP is, the journey of
one email through our system, Message-ID and In-Reply-To, why sanitizing
matters, 5 judge questions), commit and tag phase-2.
```
Cut if late: spam score (keep BlockedSender), delivery-failure notice, plus addressing.

## Phase 3: Chats, realtime, SMS alerts (Day 2, ~3.5h)
Reads: 05-conversations.md, 06 (notification rule, providers, demo console)
```
Phase 3. Implement docs/spec/05-conversations.md and the notification part of
docs/spec/06-notifications-and-telephony.md.
- Conversation APIs: list with the four filters and cursor pagination,
  resolve, detail, messages with parent info and isLong, read, patch,
  trash/spam; title and avatar rules.
- Delivery states and read receipts (respecting the readReceipts setting).
- Socket.IO with cookie auth, a room per user, the Redis subscription, and the
  events from the spec; a small typed client helper in packages/shared.
- Chat drafts on the conversation.
- SMS alerts: eligibility (active mobile session), the exact text, one-segment
  GSM-7/UCS-2 truncation, optional cooldown, a worker job through the provider
  chain, SmsLog.
- Demo console v2: live feed over Socket.IO, "gets SMS alerts" column, and the
  "Send email into PhoneMail" form with its presets (incl. malicious HTML).
- Seed data from docs/spec/09-quality.md.
- Unit tests: SMS text builder and eligibility (the keying table exists from
  Phase 2). Integration: a user without a mobile session gets an SmsLog entry,
  a user with one doesn't.
Done when: tests pass; with seed data, emailing Arjun produces an SMS in the
demo console and emailing Priya doesn't.
Then update PROGRESS.md, append to LEARNING.md (how emails become chats, why
aliases collapse into one person, how realtime works, the SMS rule, 5 judge
questions), commit and tag phase-3.
```
Cut if late: read receipts (keep delivered ticks), chat drafts.

## Phase 4: Mobile UI 1: design system, onboarding, home (Day 3, ~4h)
Reads: 07-mobile-ui.md (Design direction through Home), 09 (accessibility, i18n)
```
Phase 4. Build the first half of the mobile client from
docs/spec/07-mobile-ui.md. Mobile is the top judging priority: aim for
WhatsApp-level polish, but keep PhoneMail's own logo and wallpaper.
- Design system for /m: tokens as CSS variables in the Tailwind theme, the
  logo SVG, the mail-doodle wallpaper SVG, Noto Sans Devanagari and Tamil,
  primitives (TopBar, IconButton with required aria-label, BottomSheet,
  Dialog, Chip, Avatar with initials color, ListRow, Skeleton, Toast,
  EmptyState), screen transitions, reduced-motion support.
- Onboarding screens 1–4 exactly as specified: permission sheets, the number
  confirmation dialog, ?phone= prefill, autofill attributes, WebOTP with an
  AbortController, the one-time-code input, resend countdown, demo banner,
  error states, and the contacts sheet after verification (Contact Picker API
  where supported).
- Home: top bar, full-width search with its three result sections and "Start
  a chat with …", filter chips, chat rows with every detail in the spec,
  realtime updates, selection mode, the compose button (to a placeholder
  composer for now), empty state, and the menu drawer with Drafts, Spam and
  Trash lists.
- Every string in en/hi/ta. Check at 360px and 430px widths.
Done when: a new user can go through onboarding in a phone-sized viewport,
land on Home, see seeded chats, filter, search a number and open or create a
chat; keyboard and screen-reader basics work.
Then update PROGRESS.md, append to LEARNING.md (component structure, how
TanStack Query and Socket.IO keep screens fresh, how OTP auto-detection works,
5 judge questions), commit and tag phase-4.
```
Cut if late: selection mode, Contact Picker, message hits in search.

## Phase 5: Mobile UI 2: chat, composer, reader, settings (Day 3, ~5h)
Reads: 07-mobile-ui.md (Chat screen to the end), 05 (Replies, Subject field, Locked recipients)
```
Phase 5. Build the rest of the mobile client from docs/spec/07-mobile-ui.md.
- Chat screen: top bar, wallpaper, date separators, unread divider, bubbles
  (new email with subject, reply with quoted parent, group sender names,
  long-email clamp, attachments, ticks, star, "Replied" link),
  scroll-to-bottom, loading older messages on scroll up.
- Swipe right to reply with Framer Motion (threshold, haptic, disabled on
  replied messages), the long-press action sheet (the accessible route), the
  reply bar with "Open in full view".
- Input area: subject pill (hidden while replying), auto-grow message box,
  attach, the full-view button in the camera position, send with an
  optimistic bubble and live ticks, chat drafts.
- Traditional reader (sandboxed iframe, Show images, Reply at the bottom that
  respects reply-once) and traditional composer (Home mode, locked in-chat
  mode, reply mode, From alias picker, draft autosave, group chat for 2+
  recipients).
- Chat info. Settings: profile (photo upload with crop), aliases (live
  availability, default send-as, delete with the hold notice), language,
  notifications explanation, privacy toggles, blocked senders, devices, help,
  log out.
- Everything translated; a long-press or button alternative for every gesture.
Done when: demo story steps 2–5 in docs/spec/00-overview.md work live in a
phone viewport between two browser profiles (for example normal + incognito).
Then update PROGRESS.md, append to LEARNING.md (gesture handling, how
reply-once is enforced on both client and server, how locked recipients work,
5 judge questions), commit and tag phase-5.
```
Cut if late: chat info media grid, image viewer, photo crop (plain upload).

## Phase 6: Telephony: IVR and SMS signup (Day 4, ~2.5h)
Reads: 06-notifications-and-telephony.md
```
Phase 6. Implement IVR and SMS account creation from
docs/spec/06-notifications-and-telephony.md.
- Twilio voice webhooks with the exact TwiML flow (Gather, menu, retry,
  goodbye), the address read in digit groups, idempotent account creation,
  the confirmation SMS job, signature validation, the 5-second budget.
- Twilio SMS webhook and the SMSGate webhook (secret path): HELP handling,
  account creation, reply through the worker;
  scripts/smsgate-register-webhook.ts.
- Demo console simulators for an IVR call (showing the transcript) and an
  inbound SMS, sharing the webhooks' service code.
- README section "Enable real calls and SMS (optional)" with exact steps for
  the Twilio trial console, the cloudflared public profile, PUBLIC_BASE_URL
  and SMSGate.
- Unit tests for the TwiML builders and SMS keyword handling.
Done when: the simulators create accounts and show the right transcript and
SMS; with the public profile and Twilio configured, a real call from a
verified number creates an account (Ashish tests this by hand).
Then update PROGRESS.md, append to LEARNING.md (what IVR and TwiML are, how
webhooks and the tunnel work, why signature validation matters, the Twilio
trial limits, 5 judge questions), commit and tag phase-6.
```
Cut if late: HELP keyword, retry redirect.

## Phase 7: Web client (Day 4, ~4.5h)
Reads: 08-web-ui.md, the folders part of 04-mail-engine.md
```
Phase 7. Build the Gmail-like web client and the web login from
docs/spec/08-web-ui.md.
- /login: one card, phone → code → one Next button, the Terms line directly
  above the button, demo banner, password mode.
- Layout: top bar with search and filters, collapsible left nav with counts,
  list with toolbar, selection, pagination and thread grouping, reading view
  with sandboxed HTML, attachments and reply-once-aware Reply, floating
  compose window (From/To/Cc/Bcc/Subject/attachments) with draft autosave.
- Keyboard shortcuts with a "?" help dialog; realtime updates and the unread
  count in the tab title; settings pages reusing the mobile APIs.
- Share components where sensible, but keep the Gmail look distinct from the
  WhatsApp look.
Done when: on desktop you can sign in, read, send, star, trash, mark spam,
save drafts, search and change settings, and emails sent here appear
correctly in the mobile chats.
Then update PROGRESS.md, append to LEARNING.md (how the same data powers two
very different UIs, 5 judge questions), commit and tag phase-7.
```
Cut if late: shortcuts beyond c, / and r; the filter dropdown; thread grouping (flat list).

## Phase 8: Hardening (Day 5, ~3.5h)
Reads: 09-quality.md
```
Phase 8. Hardening pass using docs/spec/09-quality.md.
- Walk the security checklist item by item, fix gaps, and write
  docs/SECURITY.md listing what's in place.
- Accessibility pass on /m, /mail, /login and /register: keyboard, focus,
  labels, live region, contrast of every token pair, 200% text, reduced
  motion.
- Complete hi and ta for every key; no hard-coded strings left; add the
  missing-key test.
- Fill the test gaps listed in the spec; add Playwright smoke tests for mobile
  onboarding and send/receive if time allows.
- GitHub Actions: install, typecheck, lint, unit tests, docker build.
- Polish the seed data so the app looks alive on first open.
Done when: every test is green locally and in CI, and the checklists in 09
are honestly marked.
Then update PROGRESS.md, append to LEARNING.md (the security measures in plain
words, what accessibility means in this app, 5 judge questions), commit and
tag phase-8.
```
Cut if late: Playwright, the 200% text audit.

## Phase 9: Docs and fresh-clone test (Day 5, ~2.5h)
Reads: 09-quality.md (Documentation, Final acceptance checklist)
```
Phase 9. Final documentation and release check.
- README.md complete as described in docs/spec/09-quality.md (take
  screenshots with Playwright or leave clearly marked slots for Ashish).
- docs/ARCHITECTURE.md with Mermaid diagrams, docs/DECISIONS.md complete,
  OpenAPI docs at /api/docs.
- Fresh-clone test: clone the repo into a temp folder, run `docker compose up
  -d --build` with no .env, run smoke.sh, then tear it down with volumes. Fix
  anything that fails.
- Go through the final acceptance checklist and mark how each item was
  verified.
Done when: a fresh clone comes up healthy with no manual steps, and the README
answers "what is it, how do I run it, where is each feature, why is it built
this way" in under 5 minutes of reading.
Then update PROGRESS.md, append to LEARNING.md a one-page summary of the whole
system for the demo Q&A, commit and tag v1.0.
```

## Phase 10 (stretch): APK, only if Phases 0–9 are green
Reads: 07-mobile-ui.md (APK section)
```
Phase 10. Package the mobile client as an Android APK with Capacitor as
described in the APK section of docs/spec/07-mobile-ui.md: Phone Number Hint
on the number screen, SMS User Consent for the code, contacts permission and
number matching, clientType "apk" sessions. Build a debug APK in GitHub
Actions and attach it to a release. Add install steps to the README. Don't
break the web build.
Done when: the APK installs on an Android phone, signs in against the public
URL and receives email live.
```

---

## Your demo checklist (Day 5 evening)
- Start the stack with the public profile; open the tunnel URL on your phone.
- Rehearse the demo story in docs/spec/00-overview.md twice with a timer.
- Record a backup demo video in case the live call or network fails.
- Keep these tabs ready: the app on the phone, the web client, the demo
  console, Mailpit, the Twilio console, the README.
- Know your LEARNING.md answers.

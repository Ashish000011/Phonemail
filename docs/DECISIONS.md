# Design decisions and assumptions

Where the task document is silent or ambiguous, this is what PhoneMail does and
why. The AI assistant adds to this list during the build; the README links here.

1. "On creation, the fields must rest" is read as "reset": the portal clears
   both fields after each account so the next person can register.
2. Address format: Indian numbers use the 10-digit number
   (9876543210@phonemail.com, as in the task). Other countries use
   00 + country code + number (0014155550123@phonemail.com), so the two
   formats can't collide.
3. "Users who do not have the mobile application" is decided by whether the
   user has an active mobile session right now, not only by how they signed
   up. Signing in on mobile stops SMS alerts; signing out of every mobile
   session starts them again.
4. Chats are keyed by the set of other people in the email. All addresses of
   one PhoneMail user (primary, aliases, plus addresses) count as one person,
   so "all emails from the same sender stay within the same chat" even when
   they switch aliases.
5. Sending to 2+ people from Home creates the group chat for exactly that set
   and reuses it for the same set later. A new email to one of them goes to
   the 1:1 chat.
6. The set of people decides the chat even for replies. A reply from an
   outside mail app that drops people lands in the chat for the people it was
   actually sent to, still showing the quoted original.
7. Someone who only received an email as Bcc sees it in their 1:1 chat with
   the sender.
8. "Each message can be replied to only once" applies per user per message,
   to incoming and own messages, and the server enforces it.
9. Replies get "Re: <original subject>"; the subject field is hidden while
   replying, in chat view and in the traditional composer.
10. Empty subjects are allowed and shown as "(no subject)".
11. OTP delivery picks the best available path automatically: custom-text SMS
    → Twilio Verify → demo console → password mode. Twilio's trial only allows
    template SMS text, so our own codes can't travel through Twilio SMS.
12. Twilio trial SMS (alerts, confirmations) uses a Twilio template, as the
    organizers allowed. SMSGate, when configured, sends the task's exact text.
13. Per the organizers' clarification, the mobile client is a responsive web
    app at /m, with an optional Capacitor APK. True SIM number detection is
    only possible in the APK; on the web the number comes from browser
    autofill or the ?phone= link in the welcome SMS, and stays editable.
14. "The space occupied by WhatsApp's camera tab" is read as the camera button
    in WhatsApp's chat input bar; PhoneMail puts "Write in full view" there.
15. Deleted aliases are held for 30 days before anyone else can claim them,
    so mail meant for the old owner can't be captured.
16. External recipients go through a configurable SMTP relay; in demo mode
    that's Mailpit, so judges can see outgoing external mail safely.
17. Node.js 24 LTS. The task only says "Node.js or Go"; 24 is the current
    Active LTS and matches the dev machine, so local and Docker behave alike.
18. Development happens natively on Windows (not inside WSL). Images are
    built with COPY, not bind mounts, so there is no speed penalty;
    `.gitattributes` keeps LF line endings and the scripts need only bash,
    curl and Docker.
19. "Toll-free number": a Twilio trial can't get an Indian toll-free number,
    and US toll-free numbers can't be dialled from India, so PhoneMail uses the
    trial's US local number. The demo console also has "Call me": Twilio calls
    a verified phone and runs the exact same IVR flow, which avoids
    international call charges and garbled caller ID.
20. SMSGate runs on the builder's personal phone, which also receives bank
    OTPs and personal texts. On that channel only messages starting with
    JOIN (SMSGATE_SIGNUP_KEYWORD) or HELP/INFO are acted on; senders that
    aren't phone numbers are ignored; ignored message bodies are never stored
    or logged. The Twilio number is dedicated, so any text there signs up.
21. The chat input's emoji button opens a small built-in grid of common
    emoji. No emoji-picker dependency; the phone keyboard covers the rest.
22. With a 4-day window, the installable app is a PWA (manifest + service
    worker, "Add to Home screen"). The Capacitor APK stays a stretch goal.
23. Package versions: the well-known majors (TypeScript 5.9, Vite 7,
    Vitest 4, React Router 7, Prisma 6, ESLint 10) rather than the newest
    majors released weeks before the event (TypeScript 7, Vite 8, Prisma 8
    RC), which the lint and build tooling doesn't fully support yet.
24. nginx runs as the unprivileged image and listens on 8080 inside the
    container too (non-root can't bind port 80). The tunnel points at web:8080.
25. The API sets its own security headers (helmet); nginx adds the page
    headers (CSP, X-Frame-Options, …) only to the SPA files, so no header is
    sent twice.
26. Password mode: signing in with a new number creates the account (as OTP
    sign-in does: "New here? We'll create your address"). It can't prove the
    number is yours, which is exactly why OTP is the default. An account made
    with a code has no password until one is set (PASSWORD_NOT_SET).
27. Every authenticated request checks the session row, not just the JWT, so
    "Log out" and "Log out of all other devices" work immediately instead of
    after the 15-minute token expires. A primary-key lookup is cheap here.
28. A refresh token that was just rotated (within 10 seconds) is treated as
    two tabs refreshing at once (401 REFRESH_RACE, the client retries), not
    as theft. Older reuse revokes the session.
29. Outside demo mode, 6-digit codes are masked in SmsLog, so the database
    never holds a usable code. In demo mode they're shown on purpose.
30. Full-text search uses Postgres's "simple" configuration (no English
    stemming), so Hindi and Tamil words match as typed.
31. The portal previews "Your address: …" while you type, using the same
    address rule as the server (packages/shared/src/address.ts).
32. SMSGate delivers inbound-SMS webhooks straight from the phone to our
    server (not through their cloud), and signs them with X-Signature
    (HMAC-SHA256). Phase 6 verifies that signature as well as the secret path.
33. The api sends every email through our own SMTP server (logged in with a
    5-minute HMAC token), instead of writing to the database directly. One
    ingest path for all mail, and the SMTP rules (you may only send from your
    own addresses) apply to our own app too.
34. Unauthenticated SMTP senders may not use a @phonemail.com From address
    (530): nobody outside can pretend to be a PhoneMail user. Real providers
    use SPF/DKIM for this; we don't need them for a single-server demo.
35. An email whose recipients are all PhoneMail users shows two grey ticks
    ("delivered") at once, because every copy is created in the same database
    transaction. With an outside recipient it stays at one tick ("sent" =
    handed to the relay).
36. If the relay still fails after its retries, the sender's copy is marked
    "failed" and a notice from mailer-daemon@ arrives as its own chat.
37. Search returns message hits and "Start a chat with …" now; matches on
    chat names are added with the chat list in Phase 3. The web client uses
    the same message hits.
38. Search matches word prefixes (lunch:*), so results appear while typing.
    Highlights are HTML-escaped first; only <mark> tags are added.
39. Gmail folders use page numbers ("1–50 of 312", previous/next) rather than
    cursors, matching Gmail's toolbar. Threads are grouped from the newest
    1000 copies in the folder; older mail is reachable through search.
40. Incoming emails are held in memory while they arrive (25 MB maximum)
    rather than streamed to a temp file: simpler, and fine at this size.
41. In a group chat or reply, recipients always come from the chat's
    participants (their primary addresses), even if they wrote from an alias.
42. System mail (the welcome email, delivery-failure notices) never triggers
    an SMS alert: an IVR sign-up already gets a confirmation SMS, and a
    second text saying "you have an email from PhoneMail" would be noise.
43. SMS alert shortening uses "..." for GSM-7 texts, because "…" isn't in the
    GSM-7 alphabet and would switch the whole SMS to UCS-2 (70 characters).
    UCS-2 texts (Hindi, Tamil, emoji) use "…".
44. The worker skips an alert if the email was already read or trashed by
    the time the job runs (the user saw it on the web in the meantime).
45. Seeded Priya "has the mobile app" through a mobile session whose token
    is random and discarded: it switches her SMS alerts off, but nobody can
    sign in with it.
46. The demo console listens on a Socket.IO "demo" room without signing in,
    only when DEMO_MODE=true. Signed-in sockets only ever join their own
    user room.
47. Server containers default to TZ=Asia/Kolkata, so demo data ("today
    9:10") and log times match the audience.
48. A chat appears in the list once it has a visible email; "Start a chat
    with …" creates the chat row right away, but it stays hidden until the
    first email is sent, as in WhatsApp.
49. Twilio webhooks are closed (403) until TWILIO_AUTH_TOKEN is set, because
    without it we can't check that a request really comes from Twilio. The
    demo console's simulators call the same service code directly instead.
50. In password mode, a phone-call sign-up hears a 6-digit temporary PIN. The
    server (not only the UI) then blocks everything except reading your
    profile and setting a real password (403 PASSWORD_CHANGE_REQUIRED).
51. "Call me" makes Twilio call the user and play the same IVR. For those
    outbound calls the account is created for the called number (To), not
    the Twilio number (From).
52. The SMSGate webhook is protected by a secret path segment and, when
    SMSGATE_SIGNING_KEY is set, by SMSGate's HMAC signature with a 5-minute
    freshness window.
53. public-url.sh updates the Twilio number's webhooks through the Twilio
    REST API and re-registers the SMSGate webhook, because the free
    Cloudflare quick-tunnel URL changes on every restart.
54. Muted text is #54656f instead of the spec's #667781: the spec's grey is
    only 4.1:1 on the app background, below the 4.5:1 the spec requires.
55. Dates use Indian conventions in every language (en-IN, hi-IN, ta-IN):
    "16/09/2026", "3:09 pm".
56. On the web the "find my number" permission sheet focuses the number
    field on Continue, which makes Chrome offer the number it knows (from
    the Google account/SIM). True SIM reading needs the APK.
57. Shared contacts are uploaded only from the Contact Picker (the user picks
    them); where the API doesn't exist, the step is skipped silently.
58. The "Get notified" card appears the first time an email arrives while
    the app is open; granted notifications show only while the tab is in the
    background (web push is out of scope).
59. App icons are drawn by scripts/make-icons.mjs (plain Node, no image
    libraries) from the same shapes as the SVG logo.
60. Settings → Privacy lists blocked senders through two small routes the
    spec didn't have: GET /api/me/blocked and DELETE /api/me/blocked/:id.
    Unblocking only affects new mail; what is already in Spam stays there.
61. `fromAliasId: null` on POST /api/messages means "send from my phone
    number address", even when an alias is the default; leaving it out
    still means "use the default". Without this the composer could not
    pick the primary address once an alias was the default.
62. The reader keeps the spec's sandbox exactly (no allow-same-origin, no
    scripts). Because that frame has no cookies, inline (cid:) images are
    fetched by the page and passed in as data: URLs. The frame is one
    screen tall and scrolls inside, since a sandboxed frame can't report
    its height without scripts.
63. The full composer saves unsent text where it came from: opened from a
    chat (or as a reply), it autosaves into that chat's draft, so the chat
    box shows the same text; opened from Home or from Drafts, it saves a
    Draft. So the same words never exist twice.
64. Profile photos are cropped to the middle square and scaled to 512 px
    in the browser before upload (the cut list allowed plain upload; this
    costs one canvas call and keeps avatars consistent).
65. Help → About shows the web package version (set at build time) and a
    GitHub link from the optional REPO_URL setting, served in /api/config,
    so the link can be added without rebuilding.
66. In-app sound is a two-note chime made with Web Audio (no sound file),
    on by default, and the setting is kept per device in localStorage.
67. The web search filter dropdown (from / has attachment / unread) is cut,
    as the Phase 7 cut list allows. Plain search already matches words and
    sender addresses.
68. One compose window at a time on the web. Closing it with content saves a
    draft quietly (like Gmail); the phone asks "Save draft?" instead.
69. The web list is paged and grouped by thread, so live events refetch the
    visible queries instead of patching them in place (the phone patches its
    chat cache directly). New emails get a 2.5-second highlight.
70. The composer is one component with two layouts (mobile full screen, web
    floating window), so locked recipients, reply-once and drafts are
    written once for both clients.
71. Every screen is its own lazy route (React Router `lazy`), which cut the
    main bundle from 1,125 KB to about 600 KB (180 KB gzipped). Hindi and
    Tamil stay in the main file (20 KB gzipped together): loading them later
    would flash English at startup.
72. Three colours were darkened to pass WCAG AA: links #027eb5 → #026c9c,
    read ticks #53bdeb → #1a8fcc (3:1 against the green bubble), and the
    invalid-recipient chip text → #b3261e. `scripts/check-contrast.mjs`
    checks every pair and runs in CI.
73. CI's `npm audit` fails on critical advisories only; the one known high
    (deepmerge-ts in the Prisma CLI config loader) is explained in
    docs/SECURITY.md. Overriding it broke `prisma generate`, so it stays
    until Prisma ships a fix.
74. At most 3 sign-up texts per phone number per hour (IVR confirmation and
    SMS replies), so the telephony webhooks can't be used to flood a phone.

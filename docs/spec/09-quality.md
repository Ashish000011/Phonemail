# 09: Security, accessibility, i18n, tests, docs, final checklist

## Security (bonus points; list every item in the README)
- OTP: HMAC-hashed with a pepper, 5-minute expiry, 5 attempts, resend
  cooldown, per-number and per-IP limits, constant-time compare, audit events.
- Sessions: short-lived JWT plus rotating refresh tokens in httpOnly SameSite
  cookies, reuse detection, a sessions list with remote logout.
- CSRF: custom header required on state-changing requests.
- Input: zod on every route; Prisma parameterized queries.
- Rate limits: auth routes, sending (30 emails per minute per user), SMTP per
  IP, webhooks.
- Email content: sanitized HTML in a sandboxed iframe with a script-blocking
  CSP; remote images blocked by default; links open with noopener.
- Attachments: size limits, sniffed types, nosniff, download disposition,
  sanitized filenames, access checked on every download.
- SMTP: not an open relay, recipient validation, size and connection limits,
  internal-only auth tokens.
- Webhooks: Twilio signature validation, SMSGate secret path, rate limits.
- Aliases: reserved words and a 30-day hold after deletion.
- Headers (@fastify/helmet + nginx): CSP (self + websocket), HSTS on https,
  X-Frame-Options DENY, Referrer-Policy no-referrer, Permissions-Policy.
- Containers: non-root users, only needed ports published, secrets via env,
  `.env` git-ignored, `npm audit` in CI.

## Accessibility (target WCAG 2.2 AA)
- Every interactive element works by keyboard with a visible focus ring.
- Icon buttons have aria-labels, images have alt text, chat and message lists
  use list semantics, dialogs and sheets trap focus and close on Escape.
- Every swipe has a long-press menu or button alternative.
- New emails are announced through an aria-live region.
- Contrast checked for every token pair; color never carries meaning alone
  (ticks have screen-reader labels: "Sent", "Delivered", "Read").
- Text scales to 200% without clipping (rem units, flexible heights, 100dvh).
- The `lang` attribute follows the chosen language; Tamil and Devanagari fonts
  load.
- prefers-reduced-motion turns off swipe and transition animations.
- Touch targets at least 44×44px.

## i18n
- i18next with en.json, hi.json, ta.json; no hard-coded UI strings; a test
  fails when a key is missing in any language.
- Error codes map to translated messages.
- Dates and numbers through Intl with the active locale.
- Keep strings short and simple so Hindi and Tamil translate cleanly. If a
  native speaker checks them, say so in the README.

## Tests
- Unit (Vitest, required): addressing, alias validation, identity keys, the
  full conversation keying table, Bcc rule, reply-once, subject
  normalization, locked recipients, SMS eligibility, SMS text builder (GSM-7
  vs UCS-2 truncation), OTP limits and expiry, spam score, TwiML builders, SMS
  keyword handling.
- Integration (Vitest against the compose stack or a test database): OTP
  sign-up with the console provider, A → B through the API shows in B's chat,
  outside sender → PhoneMail over SMTP, relay denied, group chat creation and
  reuse, reply-once 422, portal reset flow, SMS log only for users without a
  mobile session.
- Smoke (`scripts/smoke.sh`): health, config, send an email through SMTP from
  an outside address and confirm it via the API.
- Playwright (if time): mobile onboarding at 390×844; send and receive between
  two browser contexts.
- CI (GitHub Actions): install, typecheck, lint, unit tests, docker build.

## Seed data (demo mode only, idempotent)
- 9000000001 Priya: has a mobile session (no SMS alerts).
- 9000000002 Arjun: web only (gets SMS alerts); alias `arjun`.
- 9000000003 Meera: signed up by IVR.
- Chats between them, a group chat (Priya, Arjun, Meera), an outside sender
  (newsletter@example.com), one email with an image and a PDF, one long email,
  a draft, a spam message, a replied message, a starred message. Timestamps
  spread over the past week.

## Documentation
README.md (judges read this first):
1. One-line pitch and screenshots or a GIF (mobile chat, onboarding, web inbox).
2. Quick start: `docker compose up -d`, a table of URLs (app, register, demo
   console, Mailpit, API docs, SMTP port) and the demo accounts.
3. Feature checklist mirroring the task document, each with where to find it.
4. How it works: Mermaid architecture diagram and the send/receive flow.
5. Design decisions and assumptions (link docs/DECISIONS.md).
6. Security and accessibility sections.
7. Enabling real calls and SMS (Twilio trial, SMSGate, tunnel).
8. Tech stack and why; project structure; tests and CI; troubleshooting.
Also: docs/ARCHITECTURE.md (Mermaid: containers, send sequence, IVR sequence,
SMS decision), OpenAPI at `/api/docs`, docs/DECISIONS.md, docs/SECURITY.md.

## Final acceptance checklist
Mark each item with how it was verified.

Accounts
- [ ] IVR: call the Twilio number, press 1 → account created + confirmation SMS
- [ ] SMS: text the number → account created + reply
- [ ] Portal: phone + OTP creates an account; both fields reset for the next person
- [ ] Web client: phone + OTP, one Next button, Terms line above the button
- [ ] Mobile: language → terms → number (pre-filled, editable) → OTP
      (auto-detected) → chats, with permissions at the right moments
- [ ] Password fallback works with AUTH_MODE=password
Mobile
- [ ] Compose from the bottom-right button; start a chat by searching a number
- [ ] No Inbox/Sent folders; everything is chats
- [ ] Full-width search; chips All, Unread, Attachments, Favorites
- [ ] Menu: Home, Drafts, Spam, Trash; profile icon → settings
- [ ] Settings: aliases, language, personal details, profile picture
- [ ] Subject field above the message box for new emails, hidden when replying
- [ ] Same sender stays in one chat (aliases included); replies linked by swipe
- [ ] Each message can be replied to only once (server enforced)
- [ ] Long email → traditional view with Reply at the bottom
- [ ] Full-view compose from inside a chat with recipients locked
- [ ] Recipients can't be added inside a chat, in either view
- [ ] 2+ recipients from Home → group chat; a later 1:1 email stays in the 1:1 chat
Web
- [ ] Gmail-like list, reading, compose, folders, search, profile, settings
Notifications
- [ ] Users without a mobile session get the SMS; mobile users don't
Platform
- [ ] `docker compose up -d` from a fresh clone, no .env, all services healthy
- [ ] README complete; tests pass in CI; demo console works

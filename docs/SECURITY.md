# Security in PhoneMail

What is in place, where it lives, and the limits we know about. Every item
maps to the checklist in `docs/spec/09-quality.md`.

## Sign-in codes (OTP)
- Codes are 6 random digits, stored only as an HMAC-SHA256 with a server
  pepper (`OTP_PEPPER`), so a Redis dump reveals nothing.
- Expire after 5 minutes; 5 wrong tries end the code.
- One code per number every 30 seconds; at most 5 per number and 20 per IP
  per hour (`OTP_IP_LIMIT_PER_HOUR`).
- Compared with `timingSafeEqual` (no timing leak).
- Every request, success and failure is written to the `AuthEvent` table.
- Code: `apps/server/src/modules/auth/otp.ts`.

## Sessions
- A 15-minute access token (JWT, HS256) and a 30-day refresh token, both in
  `httpOnly`, `SameSite=Lax` cookies (`Secure` on https). The refresh cookie
  is only sent to `/api/auth`.
- Refresh tokens rotate on every use and are stored hashed. Reusing an old
  one revokes the whole session (theft detection).
- Every request checks the session row, so "log out" and "log out of all
  other devices" work immediately.
- Settings → Devices lists sessions and signs out any of them.
- Code: `apps/server/src/modules/auth/{tokens,sessions,cookies,guard}.ts`.

## Passwords (fallback mode only)
- Argon2id (`@node-rs/argon2`); at least 8 characters.
- 10 wrong passwords per number lock sign-in for 15 minutes.
- A temporary PIN from a phone call is marked `mustChangePassword`: until a
  real password is set, the server refuses everything except reading your
  profile and changing the password (403 `PASSWORD_CHANGE_REQUIRED`).

## Requests
- CSRF: every state-changing API request must carry `x-requested-with:
  phonemail`, which a form on another site can't send.
- Every route validates its body, query and params with zod; bad input gets
  a 400 with a stable error code.
- Database access goes through Prisma. The one raw query (search) uses a
  tagged template, so every value is a bound parameter.
- Sending is limited to 30 emails per minute per user.

## Email content
- HTML is cleaned with sanitize-html: no scripts, styles with `url()`,
  event handlers, forms, iframes, objects, meta refresh or `javascript:`
  links. Links get `target="_blank" rel="noopener noreferrer"`.
- It is shown only in the reader, inside `<iframe sandbox="allow-popups
  allow-popups-to-escape-sandbox">` with its own CSP (`default-src 'none'`),
  so even a sanitizer miss can't run a script or touch our cookies.
- Remote images stay blocked until "Show images" (or the Privacy setting).
  That also stops tracking pixels.
- The chat view shows only the plain-text part.

## Attachments and profile photos
- 20 MB per file, 25 MB per email, 2 MB per photo.
- The type is sniffed from the file's bytes, not trusted from the upload.
- Served with `X-Content-Type-Options: nosniff`. Only JPEG, PNG, WebP and GIF
  open in the browser; everything else (SVG included) downloads, with a
  sanitized filename.
- Every download checks that the file belongs to an email you can see.

## SMTP server
- Not an open relay: mail from outside is accepted only for our own domain.
  Sending anywhere else needs a short-lived HMAC token that only the API can
  mint (`INTERNAL_SMTP_SECRET`).
- Unknown local recipients are rejected during the SMTP conversation.
- 25 MB message limit, connection limit per IP, 60 messages per IP per
  minute.

## Webhooks (Twilio and SMSGate)
- Twilio requests are checked against Twilio's HMAC-SHA1 signature.
- Twilio trial accounts deliver call webhooks through a proxy that drops the
  signature. Only then (`TWILIO_TRIAL=true`, no signature at all) PhoneMail
  looks the call up at Twilio with its own credentials and continues only if
  it belongs to our account, has the same numbers and is still in progress.
  A forged or replayed request fails that lookup.
- The SMSGate webhook sits behind a secret path segment, and optionally
  SMSGate's HMAC signature with a 5-minute freshness window.
- At most 3 sign-up texts per phone number per hour, so repeated calls or
  texts can't flood a phone or run up the SMS bill.
- On a personal SMSGate phone, only JOIN/HELP texts from phone numbers are
  acted on; other texts are ignored and never stored or logged.

## Aliases
- Reserved names (admin, postmaster, support, …) and anything starting with
  "phonemail" are refused, so nobody can impersonate the service.
- Aliases must start with a letter, so one can never look like a phone number.
- A deleted alias is held for 30 days before anyone else can take it, so
  mail meant for its old owner can't reach a stranger.

## Headers
- API: `@fastify/helmet` defaults (nosniff, frame protection, referrer policy, …).
- Pages (nginx): CSP `default-src 'self'` with scripts only from our origin,
  `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy:
  no-referrer`, a restrictive `Permissions-Policy`, and HSTS when served over
  https (`apps/web/nginx/snippets/security-headers.conf`).

## Containers and secrets
- The API, SMTP and worker images run as the `node` user; the web image is
  `nginx-unprivileged`.
- Only the app (8080), SMTP (2525) and Mailpit (8025, demo only) are
  published. Postgres and Redis stay on the internal network.
- Secrets come from environment variables; `.env` is git-ignored and
  `.env.example` documents every setting. With `DEMO_MODE=false`, the server
  warns at startup about any secret still at its development default.
- CI runs `npm audit` on production dependencies.

## Known limits (honest list)
- `npm audit` reports one "high" advisory in `deepmerge-ts` inside the Prisma
  CLI's config loader. It is reachable only when Prisma reads our own config
  file, never with user input, so CI fails only on critical advisories.
  Upgrading Prisma to a fixed release removes it.
- The SMTP port has no TLS. Inside Docker the API talks to it over the private
  network. A public deployment would put it behind a TLS-terminating proxy.
- Password mode can't prove that a number belongs to you. That is why OTP
  is the default and password mode is a fallback.
- Read receipts use blue ticks, which carry meaning by colour; they also
  have spoken labels ("Read") for screen readers.

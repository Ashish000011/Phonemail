# 03: Auth and accounts

## Account creation channels
| Channel | Where | Collects | registrationChannel | Signs in? |
|---|---|---|---|---|
| IVR call | Twilio number, press 1 | caller ID | ivr | no |
| SMS | text anything to the Twilio or SMSGate number | sender number | sms | no |
| Registration portal | `/register` | phone + OTP (phone + password in password mode) | portal | no; fields reset |
| Web client | `/login` | phone + OTP | web | yes (web session) |
| Mobile client | `/m/welcome` flow | language, terms, phone + OTP | mobile | yes (mobile session) |

One function serves every channel:
`createAccount({ phone, channel, tosVersion? }) → { user, created }`.
It normalizes the number, creates the user if missing, writes an AuthEvent,
and delivers a short welcome email from `welcome@<MAIL_DOMAIN>` through the
real mail pipeline (once the mail engine exists), so the first chat isn't
empty. An existing account is not an error for IVR, SMS, web or mobile (they
just continue); the portal reports it.

## OTP
- 6 digits from `crypto.randomInt`. Redis key `otp:<purpose>:<phoneE164>` →
  { hash: HMAC-SHA256(code, OTP_PEPPER), attempts, createdAt }, TTL 5 minutes.
- Verify with a constant-time compare. After 5 wrong attempts the challenge is
  deleted and a new code is needed (OTP_TOO_MANY_ATTEMPTS).
- Resend cooldown 30 seconds; max 5 codes per number per hour; max 20 requests
  per IP per hour. 429 responses include `retryAfterSeconds`.
- Purposes: `register` (portal) and `login` (web and mobile; creates the account
  if needed).
- Text for our own codes:
  ```
  PhoneMail sign-in: <code>

  @<host of PUBLIC_BASE_URL> #<code>
  ```
  The last line lets Chrome on Android read the code automatically (WebOTP).
  Keep it as the last line in exactly this shape. The first line stays plain:
  Indian networks reject bank-style OTP wording from a personal SIM
  (DECISIONS 81).

## Which OTP path is used (OTP_PROVIDER=auto, the default)
1. An SMS provider that can send custom text is configured (SMSGate, or Twilio
   with TWILIO_TRIAL=false): our own codes, sent through it.
2. Else TWILIO_VERIFY_SERVICE_SID is set: Twilio Verify generates, sends and
   checks the code (trial: verified numbers only).
3. Else DEMO_MODE=true: our own codes through the console provider; the code
   shows in the demo console and in a demo banner in the UIs.
4. Else: AUTH_MODE falls back to password, with a startup warning.
Twilio's trial only sends template SMS bodies, so our own codes can't travel
through Twilio SMS; that's why it isn't part of step 1.
`OTP_PROVIDER=local` or `twilio_verify` forces a path.
`otp/request` returns `demoCode` only when the console provider delivered the
code (never when DEMO_MODE=false).

## AUTH_MODE
- `otp` (default), `password`, or `both` (OTP first, "Use password instead").
- Resolved mode is exposed at `GET /api/config` so every UI renders the right
  fields.
- Passwords: argon2id via @node-rs/argon2, minimum 8 characters.
- The portal in password mode still has exactly two fields: phone + password.
- IVR/SMS-created accounts in password mode: the IVR reads out a 6-digit
  temporary PIN (also sent by SMS when a custom-text provider exists) and sets
  `mustChangePassword`; first login forces a new password.

## Sessions
- Access token: JWT (HS256, JWT_SECRET), 15 minutes, httpOnly cookie `pm_at`.
- Refresh token: 32 random bytes, stored hashed on the Session, 30 days,
  httpOnly cookie `pm_rt` with path `/api/auth`, rotated on every refresh.
  Presenting the previous token again revokes the session (theft detection).
- Cookies: httpOnly, SameSite=Lax, Secure when PUBLIC_BASE_URL is https.
- CSRF: state-changing requests must send `X-Requested-With: phonemail`
  (the web api client always adds it; cross-site forms can't).
- `client` on sign-in: the mobile UI sends `mobile`, desktop sends `web`, the
  APK sends `apk`. Stored as Session.clientType.
- Mobile session = clientType mobile or apk, not revoked, not expired,
  lastSeenAt within 30 days. lastSeenAt updates at most every 5 minutes.
- Logout revokes the current session. Settings lists sessions and can revoke
  any of them ("Log out of all other devices").

## API
- `GET  /api/config` → { authMode, demoMode, mailDomain, languages, tosVersion, otpPath }
- `POST /api/auth/otp/request` { phone, purpose } → { phoneE164, resendAfterSeconds, demoCode? }
- `POST /api/auth/otp/verify` { phone, code, client, tosVersion? } → cookies + { user, created }
- `POST /api/auth/password/login` { phone, password, client }
- `POST /api/auth/password/change` { currentPassword?, newPassword }
- `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/logout-others`
- `GET /api/me`, `PATCH /api/me` { displayName, about, language, readReceipts, loadRemoteImages, defaultSendAsAliasId }
- `POST /api/me/avatar` (multipart; JPEG/PNG/WebP checked by magic bytes; max 2 MB)
- `GET /api/me/sessions`, `DELETE /api/me/sessions/:id`
- Aliases: `GET /api/aliases`, `GET /api/aliases/check?localPart=` → { available, reason? },
  `POST /api/aliases`, `DELETE /api/aliases/:id`
- Portal: `POST /api/portal/otp/request` { phone } (409 ALREADY_REGISTERED if
  the number has an account), `POST /api/portal/register` { phone, code }
  → { address }; sets no cookies. Password mode: `POST /api/portal/register`
  { phone, password }.
- One error shape everywhere: `{ error: { code, message, details? } }` with
  stable codes (INVALID_PHONE, OTP_EXPIRED, OTP_INVALID, OTP_TOO_MANY_ATTEMPTS,
  RATE_LIMITED, ALREADY_REGISTERED, ALIAS_TAKEN, ALIAS_RESERVED, …). UIs map
  codes to translated messages.

## Terms
`/terms` and `/privacy` are short, plain-language pages written for PhoneMail.
Record `tosVersion` and `tosAcceptedAt` when an account is created through a UI.

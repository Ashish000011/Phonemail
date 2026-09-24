# 01: Architecture

## Containers (docker compose)
| Service | Build / image | Role | Ports |
|---|---|---|---|
| web | apps/web → nginx | Serves the SPA; proxies /api, /socket.io, /webhooks to api | 8080 → 80 |
| api | apps/server `node dist/entry/api.js` | REST API, Socket.IO, Twilio and SMSGate webhooks, OpenAPI docs | internal 3000 |
| smtp | apps/server `node dist/entry/smtp.js` | SMTP server for @MAIL_DOMAIN: inbound mail + authenticated submission | 2525 → 2525 |
| worker | apps/server `node dist/entry/worker.js` | BullMQ jobs: SMS notifications, outbound relay, signup replies, cleanup | none |
| migrate | apps/server, one-shot | `prisma migrate deploy`, then idempotent seed in demo mode | none |
| postgres | postgres:16-alpine | Data and full-text search | internal 5432 |
| redis | redis:7-alpine | OTP challenges, rate limits, BullMQ, pub/sub for realtime | internal 6379 |
| mailpit | axllent/mailpit | Catches outbound mail to external domains in demo mode | 8025 → 8025 (UI) |
| cloudflared | cloudflare/cloudflared, profile `public` | Public HTTPS URL for webhooks and phone demos | none |

api, smtp, worker and migrate use one image built from apps/server with
different commands. api, smtp and worker start only after `migrate` completes
successfully and postgres and redis are healthy (`depends_on` conditions).
Every long-running service has a healthcheck.

## Key flows
Sending from any client:
client → `POST /api/messages` (api) → validate, resolve recipients → build MIME
with nodemailer → submit to smtp:2525 with SMTP AUTH (a short-lived internal
token for that user) → smtp runs the ingest pipeline: stores the message once,
creates mailbox entries for the sender (outgoing) and every local recipient
(incoming), queues relay jobs for external recipients → publishes events on
Redis → api pushes Socket.IO events; worker decides SMS notifications.

Receiving from outside:
any SMTP client → smtp:2525 without auth → local recipients only (else 550) →
the same ingest pipeline.

IVR signup: Twilio → `POST /webhooks/twilio/voice` → TwiML Gather →
`POST /webhooks/twilio/voice/menu` → accounts service → TwiML Say; a job sends
the confirmation SMS.

SMS signup: Twilio or SMSGate webhook → accounts service → a job replies by SMS.

## Why this shape (use in the README and in answers to judges)
- One language front to back (TypeScript) keeps it explainable.
- A real SMTP server makes PhoneMail genuine email: any mail client or tool
  can deliver to it, and messages carry standard threading headers.
- Splitting api / smtp / worker shows separation of concerns without the cost
  of separate codebases.
- Providers behind interfaces let the app run fully offline in demo mode and
  switch to real SMS with an env change.

## Repo layout
```
phonemail/
  apps/
    server/
      prisma/            schema.prisma, migrations/, seed.ts
      src/
        entry/           api.ts, smtp.ts, worker.ts, migrate-and-seed.ts
        config/          env.ts (zod-validated), constants.ts
        lib/             db.ts, redis.ts, queue.ts, logger.ts, errors.ts, events.ts
        modules/
          addressing/    phone normalization, alias rules, identity keys
          auth/          OTP service, passwords, sessions, routes
          accounts/      createAccount() for every channel
          users/         profile, avatar, settings, sessions list
          aliases/
          mail/          compose/send, MIME building, sanitizing, attachments
          smtp/          smtp-server wiring, ingest pipeline
          mailbox/       folders, flags, drafts, trash, spam, search
          conversations/ keying, listing, messages, reply rules, receipts
          realtime/      Socket.IO server, Redis subscription
          notifications/ SMS eligibility, text builder, jobs
          telephony/     Twilio voice + SMS webhooks, SMSGate webhook
          demo/          demo console API and simulators
        providers/
          sms/           console.ts, twilio.ts, smsgate.ts, index.ts (chain)
          otp/           local.ts, twilio-verify.ts, resolve.ts
      test/
    web/
      src/
        app/             router, providers, layouts
        mobile/          WhatsApp-style client
        desktop/         Gmail-style client
        portal/          registration portal
        demo/            demo console
        shared/          api client, socket, hooks, i18n, UI primitives
        locales/         en.json, hi.json, ta.json
  packages/shared/       zod schemas, DTO types, event names, constants
  docs/
  scripts/               smoke.sh, public-url.sh, send-test-email.ts, smsgate-register-webhook.ts
  docker-compose.yml
  .env.example
  .gitattributes         (* text=auto eol=lf)
```

## nginx
- `/api/*`, `/socket.io/*` (websocket upgrade), `/webhooks/*` → api:3000.
- Everything else → the SPA with history fallback to index.html.
- Security headers (see 09), gzip, long cache for hashed assets, no-cache for
  index.html. `client_max_body_size 30m`.

## Mobile vs desktop routing
`/` redirects to `/m` on phones (viewport under 768px or a mobile user agent)
and to `/mail` otherwise. Both UIs have a "Switch to desktop/mobile view" link.
`/login` is the web client login; `/m/welcome` starts mobile onboarding;
`/register` is the portal; `/demo` is the demo console.

## Environment variables
All have safe demo defaults; compose uses `${VAR:-default}` so no `.env` is needed.
| Var | Default | Notes |
|---|---|---|
| MAIL_DOMAIN | phonemail.com | domain of every address |
| PUBLIC_BASE_URL | http://localhost:8080 | SMS links, Twilio signature checks, WebOTP host |
| DEMO_MODE | true | console providers, demo console, seed data |
| AUTH_MODE | otp | otp, password or both (see 03) |
| DEFAULT_COUNTRY | IN | for numbers typed without a country code |
| JWT_SECRET, OTP_PEPPER, INTERNAL_SMTP_SECRET | dev values | startup warning when defaults are used with DEMO_MODE=false |
| DATABASE_URL, REDIS_URL | compose service URLs | |
| SMS_PROVIDERS | smsgate,twilio,console | priority order; unconfigured ones are skipped |
| OTP_PROVIDER | auto | auto, local or twilio_verify (see 03) |
| TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER | empty | |
| TWILIO_TRIAL | true | trial mode: SMS body must be a template name |
| TWILIO_SMS_TEMPLATE | sms_account_alerts | template used in trial mode |
| TWILIO_VERIFY_SERVICE_SID | empty | enables Twilio Verify for OTP |
| TWILIO_VOICE | Polly.Aditi | IVR voice (Indian English); fall back to Twilio's default if rejected |
| SMSGATE_API_URL | https://api.sms-gate.app/3rdparty/v1 | SMSGate cloud mode |
| SMSGATE_USERNAME, SMSGATE_PASSWORD | empty | shown in the SMSGate app |
| SMSGATE_WEBHOOK_SECRET | dev value | secret path segment for the inbound SMS webhook |
| SMSGATE_SIGNUP_KEYWORD | JOIN | SMSGate inbound texts must start with this to sign up (personal phone); empty = any text |
| SMTP_RELAY_HOST, SMTP_RELAY_PORT, SMTP_RELAY_USER, SMTP_RELAY_PASS | mailpit, 1025 | outbound relay for external domains |
| SMS_NOTIFY_COOLDOWN_SECONDS | 0 | optional per-sender throttle |

On startup, api logs a provider summary: active SMS providers, which can send
custom text, the resolved OTP path, the resolved AUTH_MODE, and demo mode.
`GET /api/config` exposes the non-secret parts to the UIs.

## Docker requirements
- Multi-stage builds on `node:24-slim` (Prisma is happier on Debian than
  Alpine; install `openssl`, which Prisma needs and slim lacks), non-root user, `npm ci`, production dependencies only in the final
  stage.
- Volumes: `pgdata`, `redisdata`, `maildata` (raw .eml files and attachments
  under /data, mounted into api, smtp and worker).
- From a clean machine, `docker compose up -d` builds, migrates, seeds (demo
  mode) and gets every service healthy within a few minutes. Test this from a
  fresh clone before submission.
- `.gitattributes` forces LF line endings so shell scripts work when the repo
  is cloned on Windows.
- `docker compose --profile public up -d` also starts cloudflared in
  quick-tunnel mode (`tunnel --url http://web:80`); its logs print a
  `https://….trycloudflare.com` URL for PUBLIC_BASE_URL, Twilio and SMSGate.

## Observability
pino JSON logs with a request id; `/api/health` (Postgres + Redis),
`/api/ready`; worker logs every job result; SmsLog and AuthEvent tables double
as audit trails.

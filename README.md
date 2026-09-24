# PhoneMail

**Email where your phone number is your address:** `9876543210@phonemail.com`.
A WhatsApp-style mobile client, a Gmail-style web client, sign-up by phone
call (IVR), SMS, a registration portal or the apps, and SMS alerts for people
who don't use the mobile app.

Built for the AlphaStack 7-Day Buildathon (NIT Trichy).

> Work in progress: the README grows with every build phase. See
> [docs/PROGRESS.md](docs/PROGRESS.md) for the current status.

## Quick start

You need Docker (Docker Desktop on Windows/macOS). Nothing else.

```bash
docker compose up -d
```

The first run builds the images and takes a few minutes. No `.env` is needed:
everything runs in demo mode with safe defaults.

| What | Where |
|---|---|
| The app (redirects to mobile or desktop) | http://localhost:8080 |
| Mobile client (WhatsApp-style) | http://localhost:8080/m |
| Web client (Gmail-style) | http://localhost:8080/mail |
| Registration portal | http://localhost:8080/register |
| Demo console | http://localhost:8080/demo |
| Mailpit (outgoing mail to other domains) | http://localhost:8025 |
| API health | http://localhost:8080/api/health |
| SMTP server | `localhost:2525` |

Check that everything works:

```bash
./scripts/smoke.sh
```

(On Windows, run it from Git Bash.)

Stop it with `docker compose down` (add `-v` to also delete the data).

## Services

| Container | Role |
|---|---|
| web | nginx: serves the app, forwards `/api`, `/socket.io`, `/webhooks` to api |
| api | REST API (Fastify) |
| smtp | PhoneMail's own SMTP server for `@phonemail.com` |
| worker | background jobs (SMS alerts, outbound mail, cleanup) |
| migrate | one-shot: database migrations and demo seed data |
| postgres | data and full-text search |
| redis | OTP codes, rate limits, job queues, realtime events |
| mailpit | catches mail sent to outside addresses in demo mode |
| cloudflared | optional public HTTPS URL (`--profile public`) |

## Enable real calls and SMS (optional)

Everything works without this: in demo mode, codes and SMS appear in the demo
console, and the console simulates calls and texts. For the real thing:

### 1. A public HTTPS address (for Twilio, SMSGate and your phone)

```bash
docker compose --profile public up -d
./scripts/public-url.sh
```

`public-url.sh` finds the `https://….trycloudflare.com` address, saves it as
`PUBLIC_BASE_URL` in `.env`, restarts the services, and (when configured)
points Twilio and SMSGate at it. The address changes every time the tunnel
restarts; just run the script again. Open `<that address>/m` on your phone.

### 2. Twilio (phone call sign-up, SMS alerts)

1. Sign up for a free trial at twilio.com and verify your own mobile number
   (trial accounts can only call and text verified numbers, up to 5).
2. Get a phone number. Choose a **US local number**, not toll-free: US
   toll-free numbers can't be dialled from India.
3. Put these in `.env` (copy `.env.example`):
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.
4. Run `./scripts/public-url.sh` again: it sets the number's call and SMS
   webhooks for you. (By hand: in the Twilio console, set "A call comes in" to
   `<public address>/webhooks/twilio/voice` and "A message comes in" to
   `<public address>/webhooks/twilio/sms`, both HTTP POST.)
5. Call the number and press 1, or use **Call me** in the demo console to
   have Twilio call you (no international call charges). Trial calls start
   with a short Twilio notice.

Trial limits: Twilio's trial can only send its ready-made SMS templates, so
alerts arrive as a Twilio template (the organizers allow this) and sign-in
codes don't travel through Twilio. That's what SMSGate is for.

### 3. SMSGate (your Android phone as the SMS gateway: real codes, exact alert text)

1. Install **SMS Gateway for Android** (sms-gate.app) on an Android phone
   with a SIM, open it, turn on **Cloud server**, and note the username and
   password it shows. In your messaging app, turn RCS/chat features off so
   texts arrive as plain SMS. Allow the app to run in the background.
2. Put `SMSGATE_USERNAME` and `SMSGATE_PASSWORD` in `.env`, and run
   `./scripts/public-url.sh`. It registers the webhook for incoming texts.
3. Now sign-in codes arrive by real SMS (Chrome on Android fills them in
   automatically), SMS alerts use the task's exact text, and texting
   **JOIN** to the phone creates an account.

Using your personal phone is fine. Texts go out from your SIM (normal SMS
charges and daily limits apply), and while the webhook is registered the
phone forwards every text it receives. PhoneMail only acts on texts that start
with JOIN (or HELP) from real phone numbers, and never stores the others.
Remove the webhook after the demo:

```bash
docker compose exec api node dist/scripts/smsgate-webhook.js unregister
```

## Local development

Requires Node.js 24.

```bash
npm install
npm run typecheck
npm run lint
npm test
```

## Troubleshooting

- **`npm ci` fails inside Docker with a missing native module** (for example
  `@rollup/rollup-linux-x64-gnu`): the lockfile was made on another OS.
  Regenerate it on Linux:
  `docker run --rm -v "$PWD":/app -w /app node:24-slim npm install --package-lock-only`
- **Port 8080, 8025 or 2525 is busy:** stop the other program, or change the
  left side of the port mapping in `docker-compose.yml`.

## Documentation

- [docs/DECISIONS.md](docs/DECISIONS.md): how unclear requirements were resolved
- [docs/spec/](docs/spec/): the full specification
- [docs/LEARNING.md](docs/LEARNING.md): plain-English notes on how it all works

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

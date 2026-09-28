# How PhoneMail is built

One server codebase with three entry points (API, SMTP, worker), one React
app with two very different faces (mobile and web), and Postgres and Redis.
Everything runs with `docker compose up -d`.

## Containers

```mermaid
flowchart LR
  phone["Phone browser /m"] --> web
  laptop["Laptop browser /mail"] --> web
  twilio["Twilio (calls, SMS)"] -->|/webhooks/twilio| web
  smsgate["SMSGate phone"] -->|/webhooks/smsgate| web
  outside["Outside mail servers"] -->|SMTP :2525| smtp

  subgraph compose["docker compose"]
    web["web: nginx + the React app"] -->|/api /socket.io /webhooks| api["api: Fastify + Socket.IO"]
    api -->|submits every email| smtp["smtp: PhoneMail's SMTP server"]
    smtp --> pg[(postgres)]
    api --> pg
    api <--> redis[(redis)]
    smtp --> redis
    worker["worker: BullMQ jobs"] <--> redis
    worker --> pg
    worker -->|outside recipients| mailpit["mailpit (demo)"]
    migrate["migrate: migrations + seed (one-shot)"] --> pg
  end

  worker -->|SMS| providers["SMSGate → Twilio → console"]
```

- **api** answers the apps, runs the IVR and SMS webhooks, and pushes live
  events to browsers over Socket.IO.
- **smtp** is the only way mail gets in, whether it comes from outside or
  from our own apps, so every email goes through one ingest pipeline.
- **worker** sends SMS alerts and sign-up texts, relays mail to outside
  addresses, and cleans up.
- **redis** holds OTP hashes, rate-limit counters, job queues and the
  `events` channel that carries live updates from any process to the api.

## Sending an email (app to app)

```mermaid
sequenceDiagram
  participant A as Arjun's web client
  participant API as api
  participant S as smtp
  participant DB as postgres
  participant R as redis
  participant P as Priya's phone

  A->>API: POST /api/messages {to, subject, body}
  API->>API: rules: locked recipients, reply once, 30/min
  API->>S: SMTP with a short-lived HMAC token
  S->>DB: ingest: parse, sanitize, one Message + one entry per person, conversation key
  S->>R: publish mail.delivered
  R-->>API: events channel
  API-->>P: Socket.IO "message:new" (bubble appears)
  S->>R: queue SMS alert if Priya has no mobile session
```

The conversation key is the set of people in the email (minus you), so
the same people always land in the same chat, whoever wrote first and from
whichever client.

## Mail from outside

```mermaid
sequenceDiagram
  participant O as outside@example.com
  participant S as smtp
  participant DB as postgres
  O->>S: RCPT TO 9876543210@phonemail.com
  S->>S: local domain and a real user? (otherwise 550, no open relay)
  O->>S: DATA (up to 25 MB)
  S->>DB: same ingest pipeline, spam score, blocked senders go to Spam
```

## Sign-up by phone call (IVR)

```mermaid
sequenceDiagram
  participant C as Caller
  participant T as Twilio
  participant API as api
  participant W as worker
  C->>T: calls the number
  T->>API: POST /webhooks/twilio/voice (signed)
  API-->>T: TwiML: "Press 1 to create your address"
  C->>T: presses 1
  T->>API: POST /webhooks/twilio/voice/menu {Digits: 1, From}
  API->>API: create the account for From (or find it)
  API-->>T: TwiML: reads the new address digit by digit
  API->>W: queue the confirmation SMS (max 3 per number per hour)
  W->>C: "Your PhoneMail address is 9876543210@phonemail.com"
```

Texting JOIN to the Twilio number or the SMSGate phone does the same through
`/webhooks/twilio/sms` and `/webhooks/smsgate/<secret>`.

## Who gets an SMS alert?

```mermaid
flowchart TD
  new["New incoming email for user U"] --> mobile{"Does U have an active\nmobile-app session?"}
  mobile -->|yes| none["No SMS: the phone shows it live"]
  mobile -->|no| queue["Queue an alert"]
  queue --> text["'You have received an email from Arjun. Subject: Lunch.'\n(cut to one SMS segment)"]
  text --> chain{"Provider chain"}
  chain -->|configured| sg["SMSGate: exact text"]
  chain -->|else| tw["Twilio trial: a Twilio template"]
  chain -->|else| con["Console: shown in the demo console"]
```

## Where things are

```
apps/server/src
  entry/        api.ts, smtp.ts, worker.ts, migrate-and-seed.ts
  modules/      auth, accounts, users, aliases, mail, smtp, mailbox,
                conversations, notifications, telephony, realtime, demo, portal
  providers/    sms (smsgate, twilio, console), otp
apps/web/src
  mobile/       the WhatsApp-style client (/m)
  web/          the Gmail-style client (/mail) and /login
  portal/       /register     demo/  /demo     shared/  api client, i18n, helpers
packages/shared zod schemas and types used by both sides
```

The API is described by OpenAPI at `/api/docs` (every route declares its
body, query, params and responses with zod).

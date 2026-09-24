# 06: Notifications, SMS providers, telephony

## SMS notification rule
When an incoming entry is created for user U (not spam, not sent by U):
send an SMS if and only if U has no active mobile session (see 03). That covers
everyone who signed up by call, SMS, portal or web client and never used the
mobile client. It stops as soon as they sign in on mobile, and starts again if
they sign out of every mobile session.

Text, exactly the task's wording:
`You have received an email from <Sender>. Subject: <Subject>.`
- Sender: the PhoneMail display name or the address, whichever the recipient
  would recognize (display name + number for PhoneMail users, the address for
  outsiders).
- Subject: "(no subject)" when empty.
- Keep it to one SMS segment: 160 characters if everything is GSM-7, 70 if it
  contains other characters (Hindi, Tamil, emoji). Truncate the subject first,
  then the sender, with "…".
- Optional cooldown per (user, sender): SMS_NOTIFY_COOLDOWN_SECONDS (default 0).
- Providers that can't send custom text (Twilio trial) send their template
  instead; the organizers accept this. SMSGate sends the real text.

## Provider chain
```ts
interface SmsProvider {
  name: 'smsgate' | 'twilio' | 'console';
  isConfigured(): boolean;
  supportsCustomText(): boolean;
  send(toE164: string, body: string, purpose: SmsPurpose): Promise<SmsResult>;
}
```
- Order comes from SMS_PROVIDERS; unconfigured providers are skipped; on
  failure the next one is tried. `console` exists only in demo mode: it writes
  SmsLog with status `simulated` and pushes to the demo console.
- Every attempt is written to SmsLog.
- Jobs run in the worker: 3 retries, exponential backoff.

### Twilio trial: facts to design around (from Twilio's docs, Sept 2026)
- The trial lasts 30 days. Free units: 100 SMS, 75 voice minutes, 40 Verify
  verifications.
- Calls in and out, and SMS, only work with verified numbers, at most 5 per
  account (the sign-up number counts).
- SMS bodies must be one of Twilio's templates: sms_2fa,
  sms_appointment_reminders, sms_order_confirmation, sms_delivery_updates,
  sms_customer_support, sms_marketing_promotions, sms_event_notifications,
  sms_account_alerts, sms_feedback_surveys, sms_internal_alerts. Copy the
  exact request from the console's "Try out SMS" page and match it.
- Replies to inbound SMS can't be TwiML; send them through the REST API.
- Voice: custom TwiML works with limits. Allowed: Say, Gather (DTMF), Play,
  Redirect, Pause, Hangup. Blocked: Record, Dial→Number and others. TwiML must
  come back within 5 seconds; max 10 action/redirect hops; 10 minutes per call.
- Twilio's docs are inconsistent about SMS to non-US numbers on trial. Ashish
  tests on Day 1 whether a template SMS reaches his Indian number; if not, SMS
  alerts rely on SMSGate or the console and the README says so honestly.
Implementation:
- TWILIO_TRIAL=true → `body` = TWILIO_SMS_TEMPLATE; otherwise the real text.
- Validate `X-Twilio-Signature` on every Twilio webhook with TWILIO_AUTH_TOKEN
  and the public URL (PUBLIC_BASE_URL + path + params). Invalid → 403.
- Twilio Verify adapter for OTP: create a verification (channel sms), check it.

### SMSGate (an Android phone as the SMS gateway)
SMSGate (open source: github.com/capcom6/android-sms-gateway, docs at
docs.sms-gate.app) turns an Android phone into an SMS gateway with an HTTP API
and webhooks for incoming SMS. Cloud mode means the phone doesn't need to be on
the same network. It sends from the phone's own SIM.
- Send: `POST {SMSGATE_API_URL}/messages`, basic auth
  (SMSGATE_USERNAME / SMSGATE_PASSWORD), body
  `{ "textMessage": { "text": "…" }, "phoneNumbers": ["+91…"] }`.
- Inbound: register a webhook for event `sms:received` at
  `{PUBLIC_BASE_URL}/webhooks/smsgate/{SMSGATE_WEBHOOK_SECRET}`. The payload
  has `event` and `payload` { message, sender, recipient, receivedAt, … }.
  `scripts/smsgate-register-webhook.ts` registers it.
- Turn off RCS/chat features in the gateway phone's messaging app so incoming
  texts arrive as plain SMS.
- Confirm the current API shape in the SMSGate docs before coding; keep the
  adapter small.

## IVR account creation (Twilio voice)
`POST /webhooks/twilio/voice`:
```xml
<Response>
  <Gather input="dtmf" numDigits="1" timeout="7" action="/webhooks/twilio/voice/menu" method="POST">
    <Say voice="{TWILIO_VOICE}" language="en-IN">Welcome to PhoneMail, where your phone number is your email address. To create your free PhoneMail account, press 1.</Say>
  </Gather>
  <Redirect method="POST">/webhooks/twilio/voice?retry=1</Redirect>
</Response>
```
With `retry=1` and still no input: say goodbye and hang up.

`POST /webhooks/twilio/voice/menu`:
- Digits = 1 → createAccount({ phone: From, channel: 'ivr' }).
  - New account: "Your PhoneMail account is ready. Your email address is
    9 8 7 6 5, 4 3 2 1 0, at phonemail dot com. We've sent you an SMS with the
    details. Thank you for calling." then Hangup; enqueue the confirmation SMS.
  - Existing account: "You already have a PhoneMail account. Your email
    address is …".
  - Password mode: also read out the temporary PIN twice (see 03).
- Any other digit: "Sorry, that's not an option." and redirect to the menu
  once, then goodbye.
- Read the local part in two groups of five digits so callers can follow.
- Stay inside the 5-second budget: do the database work directly (it's fast)
  and push the SMS to the queue.

"Call me" (demo console, needs Twilio credentials): `POST /api/demo/ivr/call-me`
{ phone } makes Twilio call that verified number with
`url = PUBLIC_BASE_URL/webhooks/twilio/voice`. For outbound calls
(Direction = outbound-api) the caller is `To`, not `From`. Same TwiML, same
account creation. Use a US *local* Twilio number: US toll-free numbers can't
be dialled from India. Trial calls start with a short Twilio notice.

## SMS account creation
Inbound SMS from Twilio (`POST /webhooks/twilio/sms`) or SMSGate:
- SMSGate only (it runs on a personal phone that also gets bank OTPs and
  personal texts): ignore senders that aren't valid phone numbers, and act
  only on texts starting with SMSGATE_SIGNUP_KEYWORD (default JOIN) or
  HELP/INFO. Ignored bodies are never stored or logged. The Twilio number is
  dedicated, so any text there counts.
- HELP or INFO (any case) → reply with what PhoneMail is and how to join.
- Anything else → createAccount({ phone: sender, channel: 'sms' }) and reply
  "Welcome to PhoneMail! Your email address is 9876543210@phonemail.com. Sign
  in at <PUBLIC_BASE_URL>/m?phone=9876543210" (custom-text providers; the
  Twilio trial sends its template).
- Respond 200 with an empty body right away; the worker sends the reply.

## Public URL for webhooks and phone demos
- `docker compose --profile public up -d` starts cloudflared; its logs show a
  `https://….trycloudflare.com` URL (it changes on every restart).
- `scripts/public-url.sh` does the rest in one command: reads the URL from
  the cloudflared logs, writes PUBLIC_BASE_URL to .env, recreates api and
  worker, sets `<url>/webhooks/twilio/voice` and `<url>/webhooks/twilio/sms`
  on the Twilio number through the REST API (when credentials are set), and
  re-registers the SMSGate webhook. The manual steps stay in the README as a
  fallback.
- The same URL gives HTTPS on a phone, which WebOTP and the service worker need.
- README section: "Enable real calls and SMS (optional)" with these steps.

## Demo console (`/demo`, only when DEMO_MODE=true)
The judges' toolbox, with a clear "Demo mode" banner.
- Live feed (Socket.IO room `demo`) of every SMS attempt (to, text, provider,
  status) and every OTP with its code, newest first.
- Users table: number, address, signup channel, mobile session yes/no, "gets
  SMS alerts" yes/no, created at.
- Simulate an IVR call: enter a number and a digit → runs the same service
  code as the Twilio webhook and shows the transcript the caller would hear.
- Simulate an inbound SMS: number + text → same code path as the webhooks.
- Send an email into PhoneMail from any address through the real SMTP server
  on port 2525, with presets: plain email, long email, email with an
  attachment, and "malicious HTML" (script tags, onerror handlers,
  javascript: links, a tracking pixel) to show the sanitizer working.
- Links: Mailpit, API docs, health.

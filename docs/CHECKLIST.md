# Final acceptance checklist

From `docs/spec/09-quality.md`. Each item says how it was verified, honestly.

Legend:
- **Live**: done by hand against the real stack (`docker compose up`,
  real Postgres, Redis, SMTP), in a browser at phone or desktop size.
- **Integration**: an API test against the running stack
  (`npm run test:integration -w apps/server`, 19 tests, also run in CI).
- **Smoke**: `./scripts/smoke.sh` against the running stack (14 checks).
- **Unit**: unit tests (`npm test`).
- **Real device**: a real phone, through the Twilio trial or SMSGate.
- **Pending device**: not yet tried on a real phone.

## Accounts
- [x] IVR: call the number, press 1 → account + confirmation SMS.
  Live through the demo console simulator (address read digit by digit, SMS
  in the feed); Unit (TwiML, IVR script, Twilio signatures). Real device
  (25 Sep): Twilio's "Call me" rang the builder's phone, played the menu, and
  pressing 1 read out the existing account. The trial's shared number can't
  take incoming calls (DECISIONS 77).
- [x] SMS: text JOIN → account + reply. Live through the simulator
  (created + welcome SMS; a text without the keyword is ignored and not
  logged); Unit. Real device (25 Sep, SMSGate): JOIN from a second phone
  created an account (channel `sms`) and the welcome SMS arrived; JOIN from
  an existing number got the "already have" reply; other texts were ignored.
  The gateway phone needs RCS chats off (DECISIONS 78).
- [x] Portal: phone + OTP creates an account; nobody is signed in; a second
  try says "already registered". Live (API); fields reset: Browser.
- [x] Web client: phone + OTP, one Next button, Terms line above the button.
  Live: sign-in at /login lands in /mail, the code field takes focus.
- [x] Mobile: language → terms → number → OTP → chats, with the "find your
  number" sheet at the number step. Live at 375 px. WebOTP auto-fill:
  **pending device** (Android Chrome + real SMS).
- [x] Password fallback with `AUTH_MODE=password`. Live (API): a new number
  signs up with a password; a wrong one is refused; codes are off; a phone-call
  sign-up hears a temporary PIN, which signs in but blocks everything
  (`PASSWORD_CHANGE_REQUIRED`) until a new password is set, after which the PIN
  stops working. Unit (Argon2id, minimum length, temporary PIN).

## Mobile
- [x] Compose from the bottom-right button; start a chat by searching a number. Live (compose).
- [x] No Inbox/Sent folders; everything is chats. Live.
- [x] Full-width search; chips All, Unread, Attachments, Favorites. Live (Home), Browser (chips).
- [x] Menu: Home, Drafts, Spam, Trash; profile icon → settings. Browser.
- [x] Settings: aliases, language, personal details, profile picture. Browser: live alias check, square photo crop, Tamil switch.
- [x] Subject field above the message box for new emails, hidden when replying. Live.
- [x] Same sender (aliases included) stays in one chat; replies linked. Unit (keying table); Live: reply shows the quoted original ("You" for your own).
- [x] Each message can be replied to only once (server enforced). Live: second reply → 422; Integration.
- [x] Long email → traditional view with Reply at the bottom. Live: reader with sandboxed HTML and "Show images".
- [x] Full-view compose from inside a chat with recipients locked. Browser; Integration (`RECIPIENTS_LOCKED`).
- [x] Recipients can't be added inside a chat, in either view. Integration; Browser.
- [x] 2+ recipients from Home → group chat; same people reuse it; a 1:1 email stays 1:1. Live (reused the existing group); Integration.
- [x] New email appears live, blue ticks when read. Live: an email sent by Arjun popped into Priya's open chat; ticks turned "Read" when he opened it.

## Web
- [x] Gmail-like list, reading, compose, folders, search, profile, settings.
  Live: inbox, a thread of three emails as cards, reply from the floating
  window with `r`. Browser: shortcuts, drafts, search, bulk actions, settings tabs.

## Notifications
- [x] Users without a mobile session get the SMS; mobile users don't.
  Live: Arjun (web) got "You have received an email from Priya Sharma …
  Subject: Re: Tickets booked."; Priya (mobile) got none. Integration; Unit.
  Real device (25 Sep): the alert went out through SMSGate with the exact
  text, and through Twilio as the trial's template.

## Safety
- [x] Malicious HTML is rendered harmlessly. Live: the demo console's
  "Malicious HTML" email arrives with no scripts, handlers, forms, iframes
  or `javascript:` links; the tracking pixel waits for "Show images".
- [x] Outside scam mail goes to Spam. Live (seeded) and Integration.

## Platform
- [x] `docker compose up -d` with no `.env`, all services healthy. Live on
  the dev machine (8 containers healthy, migrations and seed applied);
  CI runs the same on every push.
- [x] README complete; demo console works; smoke and integration tests pass
  against the stack. CI: see the Actions tab.

## Bugs found by the live run (all fixed, with tests)
- Integration tests quietly skipped under Vitest (`BASE_URL` clash).
- Spam detection never fired for new senders.
- A reply to a reply started a new thread when `References` named only the parent.
- Quoting your own email showed your name instead of "You".

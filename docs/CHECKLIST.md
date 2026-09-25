# Final acceptance checklist

From `docs/spec/09-quality.md`. Each item says how it was verified, honestly.

Legend:
- **Unit**: covered by unit tests (`npm test`).
- **Browser (stub)**: checked by hand in a real browser at phone size
  (390 px) or desktop size, with the API answered by a stub. Screens,
  requests and rules were checked, but not against the real database.
- **Integration**: an API test against the running stack
  (`npm run test:integration -w apps/server`, also run in CI).
- **Pending stack**: needs `docker compose up` (Docker was not installed on
  the dev machine while building). CI runs the stack on every push.
- **Pending device**: needs a real phone, a Twilio trial or SMSGate.

## Accounts
- [ ] IVR: call the Twilio number, press 1 → account + confirmation SMS.
  Unit (TwiML, IVR flow, signature checks); demo console simulator. **Pending device** for a real call.
- [ ] SMS: text the number → account + reply.
  Unit (JOIN/HELP keyword handling, ignore rules). **Pending device.**
- [x] Portal: phone + OTP creates an account; both fields reset.
  Browser (stub) at 375 px and in Tamil; the OTP rules underneath are unit-tested. The flow against the real API: **pending stack**.
- [x] Web client: phone + OTP, one Next button, Terms line above the button.
  Browser (stub): bad number, wrong code, sign-in back to the page asked for.
- [x] Mobile: language → terms → number (pre-filled, editable) → OTP → chats, permissions at the right moments.
  Browser (stub) at 360 px in English and Hindi, keyboard only too. WebOTP auto-fill: **pending device** (Android Chrome + real SMS).
- [ ] Password fallback with `AUTH_MODE=password`.
  Unit (Argon2id hashing, minimum length, temporary PIN); the forced "choose a password" screen checked in the browser (stub). Sign-in lockout and the full flow: **pending stack**.

## Mobile
- [x] Compose from the bottom-right button; start a chat by searching a number. Browser (stub).
- [x] No Inbox/Sent folders; everything is chats. Browser (stub).
- [x] Full-width search; chips All, Unread, Attachments, Favorites. Browser (stub).
- [x] Menu: Home, Drafts, Spam, Trash; profile icon → settings. Browser (stub).
- [x] Settings: aliases, language, personal details, profile picture. Browser (stub): live alias check, square photo crop, Tamil switch.
- [x] Subject field above the message box for new emails, hidden when replying. Browser (stub).
- [x] Same sender stays in one chat (aliases included); replies linked by swipe. Unit (full conversation-key table); Browser (stub) for swipe and quotes.
- [x] Each message can be replied to only once (server enforced). Unit; Integration (422); Browser (stub): swipe resists, Reply hidden.
- [x] Long email → traditional view with Reply at the bottom. Browser (stub): sandboxed HTML, Show images, Reply → reply mode.
- [x] Full-view compose from inside a chat with recipients locked. Browser (stub).
- [x] Recipients can't be added inside a chat, in either view. Integration (`RECIPIENTS_LOCKED`); Browser (stub).
- [x] 2+ recipients from Home → group chat; a later 1:1 email stays 1:1. Unit; Integration.

## Web
- [x] Gmail-like list, reading, compose, folders, search, profile, settings.
  Browser (stub): thread grouping, keyboard shortcuts, floating compose, drafts, search highlights, bulk trash/restore, settings tabs.

## Notifications
- [x] Users without a mobile session get the SMS; mobile users don't.
  Unit (eligibility, GSM-7/UCS-2 text); Integration (SMS log). Real SMS: **pending device**.

## Platform
- [ ] `docker compose up -d` from a fresh clone, no `.env`, all services healthy.
  A fresh clone installs, typechecks, lints, tests and builds on Windows. **Pending stack** for `compose up` + `smoke.sh` (CI does exactly this on every push).
- [x] README complete; demo console works (Browser, stub). Tests pass locally; CI **pending** its first run (no GitHub remote yet).

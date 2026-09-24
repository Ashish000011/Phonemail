# 00: Overview

## The product
PhoneMail is an email service where a phone number is the email address, for
example `9876543210@phonemail.com`. People create an account by phone call
(IVR), by SMS, on a registration web portal, in the web client, or in the mobile
client. The mobile client feels like WhatsApp: there are no inbox or sent
folders, every email lives in a chat with the other person. The web client
feels like Gmail. People who don't use the mobile client get an SMS whenever an
email arrives.

## Source requirements (organizers' task document)
- Account creation: toll-free number (call and press 1 through an IVR, or send
  an SMS), a registration-only web portal (phone number + OTP; fields reset
  after each account), the web client, and the mobile client. Password auth
  only if no free OTP provider is available.
- Once an account exists, it can receive email.
- Inbox access: mobile client and web client only.
- SMS notifications only for users without the mobile app (registered by
  call, portal or web client). Text:
  "You have received an email from <Sender>. Subject: <Subject>."
- Mobile client, WhatsApp design language on every screen:
  - Onboarding: 1 language, 2 terms, 3 phone number (auto-detected,
    pre-filled, editable), 4 OTP (auto-detected and verified) → inbox.
  - Device permissions requested at the right stage (number/SIM, SMS/OTP,
    contacts).
  - Home (like Spike Mail): compose button bottom-right, or search a phone
    number to open a chat; no Inbox/Sent folders, everything is chats;
    full-width search; chips All, Unread, Attachments, Favorites; top-left
    menu (Home, Drafts, Spam, Trash); top-right profile icon (aliases,
    language, personal details, profile picture).
  - Chat rules: see 05-conversations.md.
- Web client: one login screen (phone, OTP, one Next button, "By signing up,
  you agree to the Terms of Service" above the button, linked); Gmail-like UI;
  profile and settings.
- Dockerize everything; `docker compose up -d` brings it up.

## Organizer clarifications (these override the document)
1. A native APK is not required: a website with separate mobile and desktop
   interfaces is enough. An APK at free/minimal cost is preferred and "much
   better" if delivered during the buildathon.
2. Password auth is fine, OTP auth is much preferred.
3. Twilio's free tier can't send custom SMS text, so any available Twilio
   template may be used to trigger an SMS when an email arrives.
4. Custom SMS through any other free or low-cost provider is welcome.

## Organizers' deck
- Building: email application, mobile interface (prioritize), web interface.
- Key technologies: SMTP (local), Twilio, IVR, SMS gateway, web
  frontend/backend, Docker, Git.
- Requirements: all features implemented, adherence to design language,
  backend in Node.js or Go, proper README, entire app dockerized,
  `docker compose up -d`.
- Good to have: creative tech stack, user accessibility, OTP-based login,
  interface responsiveness, security features.

## Scope tiers
Must (incomplete without these):
- Every account creation channel; OTP login with password fallback.
- A real SMTP server; email between PhoneMail users; outside senders can
  deliver into PhoneMail over SMTP.
- Mobile client: every screen and chat rule in 07 and 05.
- Web client: Gmail-like list, reading, compose, folders, profile, settings.
- SMS notifications with the correct eligibility rule.
- Aliases, Drafts, Spam, Trash, Favorites, search, attachments.
- Docker compose, README, demo mode with the demo console.

Should (big score boosters, after Must works end to end):
- Realtime delivery and read ticks, Hindi and Tamil, accessibility pass,
  security pass, seed data, tests and CI, custom SMS through SMSGate.

Stretch (only when everything above is green):
- APK via Capacitor, public demo URL, web push, dark mode.

## The demo story (build for this)
Judges remember a 5-minute demo. Every Must feature should serve it:
1. Call the Twilio number and press 1: the account is created, an SMS arrives.
2. Open the mobile UI on a phone: language, terms, number pre-filled, OTP
   auto-filled, straight into the chats.
3. From the Gmail-style web client on a laptop, email that number: it pops
   into the WhatsApp-style chat instantly.
4. Swipe to reply; show the same message can't be replied to twice.
5. Email two people from Home: a group chat appears; a new email to one of
   them lands in their 1:1 chat.
6. A user without the mobile app gets "You have received an email from…".
7. Send a malicious HTML email and show it rendered harmlessly.
8. Show `docker compose up -d`, the README, the tests, the demo console.

## Glossary
- Address: `<local-part>@<MAIL_DOMAIN>`. The primary address comes from the
  phone number; aliases are extra addresses owned by the same user.
- Identity: who a participant is. A PhoneMail user is identified by user id
  (all their addresses collapse into one identity); anyone else by lowercase
  email address.
- Conversation (chat): a per-user container of emails, keyed by the set of
  other identities involved. Direct when one identity, group when two or more.
- Chat view: WhatsApp-style bubbles inside a conversation.
- Traditional view: the full-screen email reader or composer.
- Mobile session: a signed-in session created by the mobile client (mobile web
  UI or APK).
- Demo mode: `DEMO_MODE=true` (the compose default). Console providers are
  active, codes and SMS show in the demo console, seed data is loaded.

## Out of scope
IMAP/POP, calendars, end-to-end encryption, multiple mail domains, forwarding
rules, a native iOS app.

# Demo day: the plan with real phones

The README's demo story uses the simulators. This is the same story with a
real call and real texts, plus what to do when something fails.

## 15 minutes before

1. Laptop: Docker Desktop running, any Wi-Fi (ngrok works over port 443).
2. Fresh data: `./scripts/reset-demo.sh`, type `RESET`. It ends by printing
   the public address (https://…ngrok-free.dev). Your number now has no
   account, so the sign-up can be shown live.
3. Phone (the SMSGate phone):
   - SMS Gateway app open, **START SERVICE**, phone plugged in.
   - Google Messages → RCS chats **off** (texts to you must arrive as SMS).
   - Open the public address once and tap **Visit Site**, so ngrok's notice
     doesn't appear during the demo.
4. Laptop tabs, each opened once through **Visit Site**:
   - `/demo`: the demo console (codes for the demo users appear here).
   - `/mail`: signed in as Arjun, `9000000002` (his code shows in the demo
     console).
   - GitHub: the Actions tab (green runs) and the README.

## The story (about 5 minutes)

1. **Sign up by phone call.** Demo console → your number → **Call me
   (Twilio)**. Answer, press 1: the call reads out your new address, and an
   SMS with a sign-in link arrives. (Or text **JOIN** to your own number.)
2. **Phone onboarding.** Tap the link in that SMS: language → terms → number
   already filled in → the code arrives by SMS and fills itself in (Chrome on
   Android) → the chats.
3. **Web to phone.** On the laptop, Arjun emails your number: it pops into the
   phone's chat instantly.
4. **Reply once.** On the phone, swipe the bubble right and reply. Try again:
   it refuses (the server enforces it too).
5. **Groups.** From the phone's Home, email Arjun and Priya together: a group
   chat appears. Then Arjun emails only you: it lands in your 1:1 chat.
6. **SMS alert.** Email Arjun (web only) from the phone: the demo console
   shows "You have received an email from … Subject: …". Demo users are
   never texted for real (DECISIONS 80). For a real alert, email a friend's
   web-only account, or show the alert from your backup video.
7. **Safe HTML.** Demo console → **Send an email into PhoneMail** → preset
   "Malicious HTML" → your number. Open it in full view: nothing runs, remote
   images wait for **Show images**.
8. **Engineering.** `docker compose up -d`, the README, the green GitHub
   Actions run, `/api/docs`.

## If a judge wants to try it on their own phone

- **Text:** they text **JOIN** to your number. Your phone has RCS off, so
  their phone sends a real SMS; they get their address back in seconds.
- **Call:** the Twilio trial only calls verified numbers. Twilio console →
  Phone Numbers → Verified Caller IDs → add their number (Twilio texts them a
  code, about a minute). Then **Call me** with their number.
- **Sign in:** they open the public address on their phone; the code
  arrives by real SMS from your phone.

## When something fails

| Problem | Fix |
|---|---|
| Public address doesn't load | Phone hotspot, then `./scripts/public-url.sh cloudflare` (new address, printed at the end) |
| No call | Is the number verified in Twilio? Otherwise demo console → **Simulate call** |
| A text never arrives | SMS Gateway app still running? Sender's message sent as a chat (RCS)? Demo console feed shows every attempt. **Simulate SMS** runs the same code |
| Code doesn't fill itself in | Type it; it's in the SMS |
| Everything is down | Play the backup video |

## After the buildathon

- `docker compose exec api node dist/scripts/smsgate-webhook.js unregister`,
  then uninstall SMS Gateway and turn RCS chats back on.
- Twilio console: rotate the auth token.

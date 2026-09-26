# Progress

The AI assistant updates this after every phase. Read it at the start of every session.
Build order: 0 → 1 → 2 → 3 → 6 → 4 → 5a → 5b → 7 → 8 → 9 (see PHASES.md).

| Phase | What | Status | Tag | Notes |
|---|---|---|---|---|
| 0 | Scaffold and Docker skeleton | done, verified on the stack | | typecheck, lint, 34 unit tests and both builds pass; api/smtp entries verified locally. Waiting for Docker Desktop to run compose + smoke.sh |
| 1 | Data model, auth, registration portal | done, verified on the stack | | 106 unit tests pass; routes verified without a DB (validation, errors, OpenAPI with 22 routes); portal and demo console checked in the browser at 375 px and in Tamil. Needs Docker for the end-to-end run (register via portal with the demo code) |
| 2 | Mail engine | done, verified on the stack | | 159 unit tests pass (full keying table, sanitizer, spam, tokens, recipients, files); 38 routes register. Integration tests (9) and smoke.sh mail checks written; they need Docker to run |
| 3 | Chats, realtime, SMS alerts | done, verified on the stack | | 178 unit tests; 15 integration tests written (skip without the stack). Seed data, demo console v2 (live feed + send email over SMTP with 4 presets) |
| 4 | Mobile UI: design system, onboarding, home | done, verified on the stack | | Onboarding screens 1–4 checked in the browser at 360 px (en/hi), incl. keyboard flow, demo banner, auto-submit; Home, selection mode and drawer checked with stubbed data. PWA builds (manifest + icons + service worker) |
| 5a | Mobile UI: chat screen | done, verified on the stack | | Checked at 390 px with stubbed data: day labels, unread divider, quotes, attachments, clamp; long-press sheet, reply bar, optimistic send, reply-once, Enter → reader, Escape closes. Lint, typecheck, 195 + 5 tests pass |
| 5b | Mobile UI: reader, composer, chat info, settings | done, verified on the stack | | Checked at 390 px with stubbed data: reader (sandboxed HTML, Show images, inline images, details, Reply → reply mode), composer (Home chips + suggestions + invalid chip, Cc/Bcc, group hint, From picker, autosave, Save draft dialog, resume draft), chat info (rename, members → 1:1), all settings screens incl. Tamil switch, alias live check, avatar crop, forced password. 195 + 22 tests pass; 2 new integration tests |
| 6 | Telephony: IVR and SMS signup | done, verified with real phones | | Simulators in the demo console; Twilio signature checks; SMSGate JOIN gate; public-url.sh. Real (25 Sep): Twilio "Call me" IVR, Twilio template SMS, SMSGate sign-in codes, exact-text alerts, and JOIN sign-up from a second phone |
| 7 | Web client | done, verified on the stack | | Checked with stubbed data: /login (bad number, wrong code, sign-in back to /mail), inbox with thread grouping and unread count in the title, j/k/o/u/r/c/?, thread cards (folded, sandboxed HTML, Replied link), reply and new email in the floating window (minimize, full screen, quiet draft save), drafts, search with highlights, bulk trash and restore, settings tabs, log out. 195 + 22 tests pass |
| 8 | Hardening | done (CI not run yet: no GitHub remote) | | Route code-splitting (main 1,125 → 606 KB); contrast audit script, 3 colours fixed; sign-up SMS cap; docs/SECURITY.md; GitHub Actions (typecheck, lint, tests, contrast, audit; full stack with smoke + integration tests). Playwright cut (needs the stack) |
| 9 | Docs and fresh-clone test | done, verified on the stack | | README, ARCHITECTURE, SECURITY, CHECKLIST. Fresh clone installs, typechecks, lints, tests and builds with no .env. `docker compose up` + smoke.sh still to run (CI does it on every push) |
| 10 | APK (stretch, likely cut; PWA instead) | not started | | |

## Known issues
- Verified on the real stack (25 Sep): 8 containers healthy, 14 smoke checks, 19 integration
  tests, and the demo story by hand (see docs/CHECKLIST.md). Four bugs found and fixed.
- Real phones (25 Sep): Twilio "Call me" and SMS, SMSGate codes, alerts and JOIN sign-up all work.
  SMSGate needs RCS chats off on the gateway phone (DECISIONS 78). Still to try: WebOTP auto-fill on Android.
- 26 Sep: fixed public address through ngrok (DECISIONS 79), verified with a real "Call me" and a real HELP
  text on home Wi-Fi, no hotspot. Demo numbers never get real SMS (DECISIONS 80). Demo-day plan: docs/DEMO-DAY.md.
- README screenshots: slots are ready in a comment at the top.

## Cut from scope (and why)
- Web search filter dropdown (from / attachment / unread): cut list of Phase 7; plain search covers words and senders.
- Playwright browser tests: need the running stack; CI runs smoke + integration tests instead.
- Chat info media grid: cut list of Phase 5b.
- APK (Phase 10): the installable PWA covers "app on the home screen".

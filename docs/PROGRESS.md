# Progress

The AI assistant updates this after every phase. Read it at the start of every session.
Build order: 0 → 1 → 2 → 3 → 6 → 4 → 5a → 5b → 7 → 8 → 9 (see PHASES.md).

| Phase | What | Status | Tag | Notes |
|---|---|---|---|---|
| 0 | Scaffold and Docker skeleton | code done; Docker check pending | | typecheck, lint, 34 unit tests and both builds pass; api/smtp entries verified locally. Waiting for Docker Desktop to run compose + smoke.sh |
| 1 | Data model, auth, registration portal | not started | | |
| 2 | Mail engine | not started | | |
| 3 | Chats, realtime, SMS alerts | not started | | |
| 4 | Mobile UI: design system, onboarding, home | not started | | |
| 5a | Mobile UI: chat screen | not started | | |
| 5b | Mobile UI: reader, composer, chat info, settings | not started | | |
| 6 | Telephony: IVR and SMS signup | not started | | |
| 7 | Web client | not started | | |
| 8 | Hardening | not started | | |
| 9 | Docs and fresh-clone test | not started | | |
| 10 | APK (stretch, likely cut; PWA instead) | not started | | |

## Known issues
- Docker Desktop not installed yet on the dev machine: compose and smoke.sh not run.

## Cut from scope (and why)

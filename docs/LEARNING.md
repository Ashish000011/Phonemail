# Learning notes

Written by the AI assistant for Ashish after every phase, in plain English: what was
built, how it works, why it's built this way, and questions judges might ask
(with answers). Read each new section right after its phase. For anything
unclear, ask the AI assistant to explain it.

---

## Phase 0: the skeleton (scaffold and Docker)

### What was built
A monorepo (one Git repo, three npm "workspaces"):
- `packages/shared`: zod schemas and constants both sides use. Example:
  `publicConfigSchema` describes what `GET /api/config` returns; the server
  builds it and the web app validates it with the same schema.
- `apps/server`: one TypeScript codebase with four entrypoints in
  `src/entry/`: `api.ts` (REST API), `smtp.ts` (mail server, a stub until
  Phase 2), `worker.ts` (background jobs) and `migrate-and-seed.ts`
  (database setup).
- `apps/web`: the React app. Every screen is a placeholder for now, but it
  already talks to the API and switches between English, Hindi and Tamil.

### The containers and why each exists
| Container | Plain words |
|---|---|
| web (nginx) | The front door. Serves the React files and forwards `/api`, `/socket.io` and `/webhooks` to the api. Adds security headers. |
| api | Answers the app's questions (Fastify). |
| smtp | Our own post office for `@phonemail.com`: other mail servers hand letters to it on port 2525. |
| worker | Does slow jobs in the background (sending SMS, relaying mail) so the API stays fast. |
| migrate | Runs once at startup: creates/updates the database tables, loads demo data, then exits. The others wait for it. |
| postgres | The permanent data (users, emails). |
| redis | Fast short-lived data: OTP codes, rate-limit counters, job queues, live events. |
| mailpit | A fake outside world: mail to gmail.com etc. lands here in demo mode so nothing leaves your laptop. |
| cloudflared | Optional. Gives a public https:// address so a phone and Twilio can reach your laptop. |

api, smtp, worker and migrate are the **same Docker image** started with
different commands. One build, four jobs, shared code.

### How one request travels
```
Browser ──> web (nginx :8080) ──/api/*──> api (:3000) ──> postgres / redis
                 └── anything else ──> index.html (the React app)
```
nginx's `try_files … /index.html` is the "SPA fallback": `/m/chat/42` has no
file on disk, so nginx returns index.html and React Router shows the right
screen.

### Why it's built this way
- **`docker compose up -d` with no .env**: every setting has a safe default
  (`${VAR:-default}` in compose, zod defaults in `config/env.ts`). Judges run
  one command and it works.
- **Healthchecks + `depends_on` conditions**: api waits until Postgres and
  Redis are healthy *and* migrate has finished, so it never starts against an
  empty database.
- **Non-root containers**: if someone broke into a container they wouldn't be
  root inside it.
- **CSRF header**: every POST/PATCH/DELETE to `/api` must carry
  `X-Requested-With: phonemail`. A malicious site can make your browser send a
  form, but it can't add custom headers, so its request is rejected (403).
- **Provider summary at startup**: every service logs which SMS providers are
  active, how OTP codes will travel and which sign-in mode results. One look
  at the logs explains the setup.

### Judge questions
1. **Why one image for four services?** They share all the business logic
   (addressing, mail pipeline). One codebase, one build, different commands.
   That's separation of concerns at runtime without duplicating code.
2. **What happens if Postgres is slow to start?** Compose waits for its
   healthcheck (`pg_isready`), then runs migrate; api/smtp/worker start only
   after migrate exits successfully.
3. **Why nginx in front instead of serving the React app from Node?** nginx
   is built for static files, gzip, caching and WebSocket proxying, and it
   gives us one origin (`localhost:8080`) for the app and the API, so cookies
   and CORS stay simple.
4. **How do you know the system is healthy?** `/api/health` checks Postgres
   and Redis, `/api/ready` also checks the schema is migrated, each container
   has a Docker healthcheck, and `./scripts/smoke.sh` tests the whole chain.
5. **How do you stop cross-site request forgery?** The custom header check
   above, plus SameSite cookies (Phase 1).

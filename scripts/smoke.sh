#!/usr/bin/env bash
# End-to-end smoke check against the running stack (docker compose up -d).
# Needs only bash, curl and docker, so it runs in Git Bash on Windows, macOS
# and Linux.
#
#   ./scripts/smoke.sh                 # against http://localhost:8080
#   BASE_URL=https://x.trycloudflare.com ./scripts/smoke.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-240}"

pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() {
  printf '  \033[31mFAIL\033[0m %s\n' "$1"
  exit 1
}

echo "Smoke test against $BASE_URL"

echo "Waiting for the API to become healthy (up to ${TIMEOUT_SECONDS}s)..."
started=$(date +%s)
until curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; do
  if (($(date +%s) - started > TIMEOUT_SECONDS)); then
    fail "api did not become healthy. Try: docker compose ps; docker compose logs api"
  fi
  sleep 3
done
pass "api answers /api/health"

health=$(curl -fsS "$BASE_URL/api/health")
grep -q '"postgres":true' <<<"$health" || fail "postgres check: $health"
grep -q '"redis":true' <<<"$health" || fail "redis check: $health"
pass "postgres and redis reachable"

ready=$(curl -fsS "$BASE_URL/api/ready" || true)
grep -q '"ready":true' <<<"$ready" || fail "not ready (did migrate run?): $ready"
pass "database migrated"

config=$(curl -fsS "$BASE_URL/api/config")
grep -q '"mailDomain"' <<<"$config" || fail "/api/config is missing mailDomain: $config"
pass "/api/config $config"

curl -fsS "$BASE_URL/" | grep -q 'id="root"' || fail "the web app is not served"
pass "web app served"

curl -fsS "$BASE_URL/m/some/deep/link" | grep -q 'id="root"' || fail "SPA history fallback broken"
pass "SPA history fallback"

headers=$(curl -fsSI "$BASE_URL/")
grep -qi '^content-security-policy:' <<<"$headers" || fail "Content-Security-Policy header missing"
grep -qi '^x-frame-options: DENY' <<<"$headers" || fail "X-Frame-Options header missing"
pass "security headers present"

csrf_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/anything")
[[ "$csrf_status" == "403" ]] || fail "POST without CSRF header should be 403, got $csrf_status"
pass "CSRF header required on POST"

# The SMTP server greets with 220 (checked from inside the stack, no host tools needed).
docker compose exec -T api node -e "
  const s = require('net').connect(2525, 'smtp');
  s.once('data', d => { console.log(String(d).trim()); process.exit(String(d).startsWith('220') ? 0 : 1); });
  s.once('error', () => process.exit(1));
  setTimeout(() => process.exit(1), 5000);
" >/dev/null || fail "SMTP server did not greet with 220"
pass "SMTP server greets on port 2525"

# ---- mail end to end: sign in, receive over SMTP, send to the outside world ----
MAILPIT_URL="${MAILPIT_URL:-http://localhost:8025}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT
api() { curl -fsS -b "$JAR" -c "$JAR" -H 'x-requested-with: phonemail' -H 'content-type: application/json' "$@"; }

# A fresh made-up number each run, in the demo block (+91 9000 xxxxxx) that the
# server never texts for real, so the code comes back to us instead of a stranger.
PHONE="9000$((100000 + (RANDOM * 32768 + RANDOM) % 900000))"
sent=$(api -X POST "$BASE_URL/api/auth/otp/request" -d "{\"phone\":\"$PHONE\"}") ||
  fail "could not request a sign-in code (rate limited? see OTP_IP_LIMIT_PER_HOUR)"
CODE=$(sed -n 's/.*"demoCode":"\([0-9]\{6\}\)".*/\1/p' <<<"$sent")
[[ -n "$CODE" ]] || fail "no demo code returned (is DEMO_MODE on?)"
me=$(api -X POST "$BASE_URL/api/auth/otp/verify" -d "{\"phone\":\"$PHONE\",\"code\":\"$CODE\",\"client\":\"web\"}") ||
  fail "sign-in with the demo code failed"
ADDRESS=$(sed -n 's/.*"address":"\([^"]*\)".*/\1/p' <<<"$me")
pass "signed up and in as $ADDRESS with the demo code"

wait_for() { # wait_for <description> <command...>: retries for ~15 s
  local what="$1"
  shift
  for _ in $(seq 1 15); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  fail "$what"
}

wait_for "welcome email missing" bash -c "curl -fsS -b '$JAR' '$BASE_URL/api/mailbox/inbox' | grep -q 'Welcome to PhoneMail'"
pass "welcome email arrived"

SUBJECT="Smoke inbound $(date +%s)"
docker compose exec -T api node dist/scripts/send-test-email.js --to "$ADDRESS" --subject "$SUBJECT" >/dev/null ||
  fail "an outside email over SMTP was refused"
wait_for "outside email not in the inbox" bash -c "curl -fsS -b '$JAR' '$BASE_URL/api/mailbox/inbox' | grep -q '$SUBJECT'"
pass "outside email delivered over SMTP and visible through the API"

relay=$(docker compose exec -T api node dist/scripts/send-test-email.js --to someone@example.org 2>&1 || true)
grep -q "Relaying denied" <<<"$relay" || fail "open relay? an outside-to-outside email was not refused: $relay"
pass "not an open relay (550 Relaying denied)"

OUT_SUBJECT="Smoke outbound $(date +%s)"
api -X POST "$BASE_URL/api/messages" \
  -d "{\"to\":[\"friend@example.com\"],\"subject\":\"$OUT_SUBJECT\",\"body\":\"Hi from PhoneMail\"}" >/dev/null ||
  fail "sending to an outside address failed"
wait_for "outbound email never reached Mailpit" bash -c "curl -fsS '$MAILPIT_URL/api/v1/messages' | grep -q '$OUT_SUBJECT'"
pass "email to an outside address relayed to Mailpit"

echo "All smoke checks passed."

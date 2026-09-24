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

echo "All smoke checks passed."

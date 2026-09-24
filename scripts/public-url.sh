#!/usr/bin/env bash
# One command after starting the public tunnel:
#   docker compose --profile public up -d
#   ./scripts/public-url.sh
#
# 1. reads the https://….trycloudflare.com URL from the cloudflared logs
# 2. writes it to .env as PUBLIC_BASE_URL and restarts api, smtp and worker
# 3. points the Twilio number's call and SMS webhooks at it (if Twilio is set up)
# 4. re-registers the SMSGate webhook (if SMSGate is set up)
# The quick-tunnel URL changes on every restart, so run this each time.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Looking for the tunnel URL in the cloudflared logs..."
URL=""
for _ in $(seq 1 30); do
  URL=$(docker compose logs cloudflared 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  [[ -n "$URL" ]] && break
  sleep 2
done
if [[ -z "$URL" ]]; then
  echo "No tunnel URL found. Start it with: docker compose --profile public up -d"
  exit 1
fi
echo "Public URL: $URL"

# Update (or add) PUBLIC_BASE_URL in .env without touching anything else.
touch .env
if grep -q '^PUBLIC_BASE_URL=' .env; then
  sed -i.bak "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=$URL|" .env && rm -f .env.bak
else
  echo "PUBLIC_BASE_URL=$URL" >>.env
fi

echo "Restarting api, smtp and worker with the new URL..."
docker compose up -d --no-deps api smtp worker >/dev/null
for _ in $(seq 1 30); do
  docker compose exec -T api node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && break
  sleep 2
done

if grep -qE '^TWILIO_ACCOUNT_SID=.+' .env; then
  docker compose exec -T api node dist/scripts/twilio-webhooks.js || echo "(Twilio webhooks not updated, see above)"
else
  echo "Twilio not configured in .env: skipping."
fi

if grep -qE '^SMSGATE_USERNAME=.+' .env; then
  docker compose exec -T api node dist/scripts/smsgate-webhook.js register || echo "(SMSGate webhook not registered, see above)"
else
  echo "SMSGate not configured in .env: skipping."
fi

echo
echo "Open on your phone:  $URL/m"
echo "Demo console:        $URL/demo"

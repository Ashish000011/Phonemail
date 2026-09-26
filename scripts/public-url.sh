#!/usr/bin/env bash
# One command for a public HTTPS URL (phones, Twilio and SMSGate webhooks):
#   ./scripts/public-url.sh
#
# 1. starts a tunnel: ngrok when NGROK_AUTHTOKEN and NGROK_DOMAIN are set in
#    .env (a fixed address, over port 443), otherwise a Cloudflare quick tunnel
#    (no account, but a new random address on every start)
# 2. writes the URL to .env as PUBLIC_BASE_URL and restarts api, smtp and worker
# 3. points the Twilio number's call and SMS webhooks at it (if Twilio is set up)
# 4. re-registers the SMSGate webhook (if SMSGate is set up)
# Run it again after every restart of the stack or the tunnel.
set -euo pipefail
cd "$(dirname "$0")/.."
touch .env

# One value from .env, without quotes or Windows line endings (empty if unset).
setting() {
  grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' || true
}

NGROK_AUTHTOKEN=$(setting NGROK_AUTHTOKEN)
NGROK_DOMAIN=$(setting NGROK_DOMAIN)
URL=""

if [[ -n "$NGROK_AUTHTOKEN" && -n "$NGROK_DOMAIN" ]]; then
  if [[ ! "$NGROK_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "NGROK_DOMAIN in .env should look like name.ngrok-free.app (no https://, no slash)."
    exit 1
  fi
  URL="https://$NGROK_DOMAIN"
  echo "Starting the ngrok tunnel for $URL ..."
  docker compose stop cloudflared >/dev/null 2>&1 || true
  docker compose --profile ngrok up -d ngrok >/dev/null
  status=""
  for _ in $(seq 1 30); do
    status=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$URL/api/health" || true)
    [[ "$status" == "200" ]] && break
    sleep 2
  done
  if [[ "$status" != "200" ]]; then
    echo "The ngrok address doesn't answer yet (HTTP $status). ngrok's last messages:"
    docker compose logs --tail 15 ngrok
    exit 1
  fi
else
  echo "Starting the Cloudflare quick tunnel (set NGROK_* in .env for a fixed address)..."
  docker compose --profile public up -d cloudflared >/dev/null
  echo "Looking for the tunnel URL in the cloudflared logs..."
  for _ in $(seq 1 30); do
    URL=$(docker compose logs cloudflared 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
    [[ -n "$URL" ]] && break
    sleep 2
  done
  if [[ -z "$URL" ]]; then
    echo "No tunnel URL found. Last messages from cloudflared:"
    docker compose logs --tail 15 cloudflared
    exit 1
  fi
fi
echo "Public URL: $URL"

# Update (or add) PUBLIC_BASE_URL in .env without touching anything else.
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

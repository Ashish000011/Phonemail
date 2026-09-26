#!/usr/bin/env bash
# One command for a public HTTPS URL (phones, Twilio and SMSGate webhooks):
#   ./scripts/public-url.sh              the best tunnel that is set up in .env
#   ./scripts/public-url.sh tailscale    Tailscale Funnel (TS_AUTHKEY)
#   ./scripts/public-url.sh ngrok        ngrok (NGROK_AUTHTOKEN + NGROK_DOMAIN)
#   ./scripts/public-url.sh cloudflare   Cloudflare quick tunnel (no account)
#
# 1. starts the tunnel. Tailscale and ngrok keep one fixed address over port
#    443 (Tailscale without ngrok's browser warning page); the Cloudflare quick
#    tunnel needs no account but gets a new address on every start.
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

# Waits until $1/api/health answers 200 through the tunnel; shows the tunnel's log if not.
wait_for() {
  local status=""
  for _ in $(seq 1 45); do
    status=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$1/api/health" || true)
    [[ "$status" == "200" ]] && return 0
    sleep 2
  done
  echo "$1 doesn't answer yet (HTTP $status). Last messages from $2:"
  docker compose logs --tail 15 "$2"
  exit 1
}

NGROK_AUTHTOKEN=$(setting NGROK_AUTHTOKEN)
NGROK_DOMAIN=$(setting NGROK_DOMAIN)
TS_AUTHKEY=$(setting TS_AUTHKEY)
URL=""

MODE="${1:-}"
if [[ -z "$MODE" ]]; then
  if [[ -n "$TS_AUTHKEY" ]]; then
    MODE=tailscale
  elif [[ -n "$NGROK_AUTHTOKEN" && -n "$NGROK_DOMAIN" ]]; then
    MODE=ngrok
  else
    MODE=cloudflare
  fi
fi

if [[ "$MODE" == "tailscale" ]]; then
  echo "Starting Tailscale Funnel..."
  docker compose --progress quiet --profile tailscale up -d tailscale
  # The machine's name on the tailnet, like "phonemail.tail1a2b3.ts.net."
  for _ in $(seq 1 30); do
    NAME=$(docker compose exec -T tailscale tailscale status --json 2>/dev/null |
      node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);if(j.BackendState==='Running')console.log(j.Self.DNSName.replace(/\.$/,''))}catch{}})" || true)
    [[ -n "$NAME" ]] && break
    sleep 2
  done
  if [[ -z "$NAME" ]]; then
    echo "Tailscale didn't log in. Check TS_AUTHKEY in .env. Its last messages:"
    docker compose logs --tail 15 tailscale
    exit 1
  fi
  URL="https://$NAME"
  echo "Waiting for $URL (the first HTTPS certificate can take a minute)..."
  wait_for "$URL" tailscale
elif [[ "$MODE" == "ngrok" ]]; then
  if [[ ! "$NGROK_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "NGROK_DOMAIN in .env should look like name.ngrok-free.dev (no https://, no slash)."
    exit 1
  fi
  URL="https://$NGROK_DOMAIN"
  echo "Starting the ngrok tunnel for $URL ..."
  docker compose stop cloudflared >/dev/null 2>&1 || true
  docker compose --progress quiet --profile ngrok up -d ngrok
  wait_for "$URL" ngrok
elif [[ "$MODE" == "cloudflare" ]]; then
  docker compose stop ngrok >/dev/null 2>&1 || true
  echo "Starting the Cloudflare quick tunnel..."
  docker compose --progress quiet --profile public up -d cloudflared
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
else
  echo "Usage: ./scripts/public-url.sh [tailscale|ngrok|cloudflare]"
  exit 2
fi
echo "Public URL: $URL"

# Update (or add) PUBLIC_BASE_URL in .env without touching anything else.
if grep -q '^PUBLIC_BASE_URL=' .env; then
  sed -i.bak "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=$URL|" .env && rm -f .env.bak
else
  echo "PUBLIC_BASE_URL=$URL" >>.env
fi

echo "Restarting api, smtp and worker with the new URL..."
docker compose --progress quiet up -d --no-deps api smtp worker
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

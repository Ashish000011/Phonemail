#!/usr/bin/env bash
# A fresh start before presenting:
#   ./scripts/reset-demo.sh
#
# Deletes every account, email and rate limit, then brings the stack back with
# only the demo users (Priya, Arjun, Meera) and reconnects the public tunnel.
# Your real number has no account afterwards, so a live sign-up works again.
set -euo pipefail
cd "$(dirname "$0")/.."

read -r -p "This deletes ALL accounts and emails. Type RESET to continue: " answer
if [[ "$answer" != "RESET" ]]; then
  echo "Cancelled, nothing changed."
  exit 1
fi

echo "Removing the stack and its data..."
docker compose --progress quiet --profile ngrok --profile public down -v
echo "Starting fresh (demo users are added on start)..."
docker compose --progress quiet up -d --wait
./scripts/public-url.sh "$@"

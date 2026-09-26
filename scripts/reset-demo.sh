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
docker compose --progress quiet --profile ngrok --profile public --profile tailscale down
# Only the data volumes: the tunnel's login (Tailscale state) must survive,
# or the machine rejoins under a new name and the public address changes.
for volume in pgdata redisdata maildata; do
  docker volume rm "phonemail_$volume" >/dev/null 2>&1 || true
done
echo "Starting fresh (demo users are added on start)..."
docker compose --progress quiet up -d --wait
./scripts/public-url.sh "$@"

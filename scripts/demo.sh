#!/usr/bin/env bash
# One command to run the whole app on this machine and share it with a public HTTPS URL.
#
#   scripts/demo.sh          start (or restart) everything and print the public URL
#   scripts/demo.sh --build  rebuild the images first (after code changes)
#   scripts/demo.sh stop     stop everything and let the Mac sleep again
#
# Uses the local MongoDB container (data persists in a Docker volume), so Atlas IP allowlists
# don't matter. Set DEMO_USE_ATLAS=1 to use MONGODB_URI from .env instead.
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILES=(--profile public)
PIDFILE=".demo-caffeinate.pid"

stop_caffeinate() {
  if [[ -f "$PIDFILE" ]]; then kill "$(cat "$PIDFILE")" 2>/dev/null || true; rm -f "$PIDFILE"; fi
}

if [[ "${1:-}" == "stop" ]]; then
  docker compose ${PROFILES[@]+"${PROFILES[@]}"} down
  stop_caffeinate
  echo "Stopped. The Mac can sleep again."
  exit 0
fi

[[ -f .env ]] || { echo "Missing .env (copy .env.example and fill it in)." >&2; exit 1; }
if [[ "${DEMO_USE_ATLAS:-0}" != "1" ]]; then
  export MONGODB_URI='mongodb://mongo:27017/knowledge_assistant?replicaSet=rs0'
fi

BUILD=()
[[ "${1:-}" == "--build" ]] && BUILD=(--build)

# Fixed URL mode: PUBLIC_URL in .env (or the shell) = a named Cloudflare tunnel you run yourself
# (e.g. `cloudflared service install <token>`, public hostname -> http://localhost:8080).
# Then no quick tunnel is started and the URL never changes.
PUBLIC_URL="${PUBLIC_URL:-$(grep -E '^PUBLIC_URL=' .env | tail -1 | cut -d= -f2- || true)}"
PUBLIC_URL="${PUBLIC_URL%/}"
if [[ -n "$PUBLIC_URL" ]]; then
  PROFILES=()
  docker compose --profile public rm -sf tunnel >/dev/null 2>&1 || true
fi

echo "▶ Starting the stack…"
docker compose ${PROFILES[@]+"${PROFILES[@]}"} up -d ${BUILD[@]+"${BUILD[@]}"}

URL="$PUBLIC_URL"
[[ -z "$URL" ]] && echo "▶ Waiting for the public tunnel URL…"
for _ in $(seq 1 60); do
  [[ -n "$URL" ]] && break
  # The assigned URL is printed in a banner; "api.trycloudflare.com" only appears in error lines.
  URL=$(docker compose ${PROFILES[@]+"${PROFILES[@]}"} logs tunnel 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | grep -v '^https://api\.' | tail -1 || true)
  [[ -n "$URL" ]] && break
  sleep 2
done
if [[ -z "$URL" ]]; then
  echo "✘ Cloudflare didn't assign a tunnel URL within 2 minutes. Last tunnel messages:" >&2
  docker compose ${PROFILES[@]+"${PROFILES[@]}"} logs --tail 3 tunnel >&2 || true
  echo "  The app is still running locally at http://localhost:8080. Cloudflare's free quick" >&2
  echo "  tunnels are sometimes slow or rate-limited after many restarts: wait a few minutes and" >&2
  echo "  run scripts/demo.sh again." >&2
  exit 1
fi

# Clerk session tokens are only accepted from allowed origins: add the tunnel URL, then
# recreate the API with it. Nginx is restarted so it picks up the new API container address.
export CLERK_AUTHORIZED_PARTIES="$URL,http://localhost:8080,http://localhost:3000"
export FRONTEND_URL="$URL"
docker compose ${PROFILES[@]+"${PROFILES[@]}"} up -d --no-deps --force-recreate api >/dev/null
docker compose ${PROFILES[@]+"${PROFILES[@]}"} restart nginx >/dev/null

echo "▶ Waiting for the API…"
for _ in $(seq 1 60); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ${PROFILES[@]+"${PROFILES[@]}"} ps -q api)" 2>/dev/null)" == "healthy" ]] && break
  sleep 2
done

# Keep the Mac awake (display, idle and system sleep) while the demo is running.
stop_caffeinate
nohup caffeinate -dimsu >/dev/null 2>&1 &
echo $! > "$PIDFILE"

echo
echo "✔ Public URL:  $URL"
echo "  Local URL:   http://localhost:8080"
echo
echo "  Keep this Mac on power with the lid open. The URL changes if the tunnel restarts:"
echo "  run scripts/demo.sh again to get the new one. Stop with: scripts/demo.sh stop"

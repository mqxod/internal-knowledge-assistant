#!/usr/bin/env bash
# Build and (re)start the production stack. Safe to re-run for updates.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Missing .env (copy .env.example and fill it in)"; exit 1; }
git pull --ff-only || true
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
$COMPOSE build --pull
$COMPOSE up -d --remove-orphans
$COMPOSE ps
docker image prune -f >/dev/null
DOMAIN="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"
sleep 5 && ./scripts/smoke.sh "https://$DOMAIN"

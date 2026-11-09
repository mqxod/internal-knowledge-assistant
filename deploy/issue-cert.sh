#!/usr/bin/env bash
# Issues a Let's Encrypt certificate for $DOMAIN and configures automatic renewal.
# Usage (from the repository root on the server): ./deploy/issue-cert.sh you@example.com
set -euo pipefail
EMAIL="${1:?Usage: issue-cert.sh <contact-email>}"
cd "$(dirname "$0")/.."
DOMAIN="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"
[ -n "$DOMAIN" ] || { echo "Set DOMAIN in .env first"; exit 1; }
COMPOSE="docker compose -f $(pwd)/docker-compose.yml -f $(pwd)/docker-compose.prod.yml"

# Port 80 must be free for the standalone challenge; renewals stop/start Nginx for a few seconds.
$COMPOSE stop nginx 2>/dev/null || true
sudo certbot certonly --standalone --non-interactive --agree-tos -m "$EMAIL" -d "$DOMAIN" \
  --pre-hook "$COMPOSE stop nginx" \
  --post-hook "$COMPOSE start nginx"
echo "Certificate issued. Ubuntu's certbot.timer renews it automatically (check: systemctl list-timers | grep certbot)."

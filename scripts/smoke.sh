#!/usr/bin/env bash
# Post-deployment smoke test: ./scripts/smoke.sh https://your-domain
set -uo pipefail
BASE="${1:?Usage: smoke.sh <base-url>}"
fail=0
check() { if eval "$2"; then echo "  ✔ $1"; else echo "  ✖ $1"; fail=1; fi; }

echo "Smoke testing $BASE"
check "health endpoint returns ok" "curl -fsS '$BASE/api/v1/health' | grep -q '\"status\":\"ok\"'"
check "unauthenticated API call is rejected (401)" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' '$BASE/api/v1/auth/me')\" = 401 ]"
check "admin endpoint without a token is rejected (401)" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' '$BASE/api/v1/documents')\" = 401 ]"
check "sign-in page renders (200)" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' '$BASE/sign-in')\" = 200 ]"
check "app routes redirect anonymous users to sign-in" "curl -s -o /dev/null -w '%{http_code} %{redirect_url}' '$BASE/assistant' | grep -qE '^30[0-9] .*sign-in'"
if [[ "$BASE" == https://* ]]; then
  host="${BASE#https://}"
  check "HTTP redirects to HTTPS" "curl -s -o /dev/null -w '%{redirect_url}' 'http://$host/' | grep -q '^https://'"
  check "HSTS header present" "curl -sI '$BASE/sign-in' | grep -qi strict-transport-security"
  check "certificate is valid" "curl -fsS -o /dev/null '$BASE/sign-in'"
fi
check "server version is not disclosed" "! curl -sI '$BASE/api/v1/health' | grep -qiE '^server: nginx/[0-9]|x-powered-by'"
exit $fail

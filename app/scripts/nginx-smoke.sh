#!/bin/sh
# Serves dist/client with deploy/nginx.conf in Docker and checks the cache headers the update
# policy depends on (pwa-offline.md §5). Run after `pnpm build`.
set -eu
cd "$(dirname "$0")/.."
PORT="${NGINX_SMOKE_PORT:-8089}"
NAME="vscout-nginx-smoke-$$"
docker run -d --rm --name "$NAME" -p "$PORT:80" \
  -v "$PWD/dist/client:/srv/vscout:ro" \
  -v "$PWD/deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$PWD/deploy/security-headers.conf:/etc/nginx/vscout/security-headers.conf:ro" \
  nginx:1.27-alpine >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 1; done

fail=0
check() { # path, expected status, header regex
  out=$(curl -s -o /dev/null -D - "http://localhost:$PORT$1")
  status=$(printf '%s' "$out" | head -1 | awk '{print $2}')
  if [ "$status" != "$2" ] || ! printf '%s' "$out" | grep -qi "$3"; then
    echo "FAIL $1: expected $2 and /$3/, got $status"; fail=1
  else
    echo "ok   $1 ($2, $3)"
  fi
}
asset=$(cd dist/client && ls assets/*.js | head -1)
check /sw.js 200 "cache-control: no-cache"
check /version.json 200 "cache-control: no-store"
check /manifest.webmanifest 200 "content-type: application/manifest+json"
check "/$asset" 200 "cache-control: public, max-age=31536000, immutable"
check /assets/missing-chunk.js 404 "x-content-type-options: nosniff"
check /teams/254 200 "cache-control: no-cache"
check / 200 "referrer-policy: same-origin"
exit $fail

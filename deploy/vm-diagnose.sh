#!/usr/bin/env bash
# Read-only diagnosis that runs ON the VM, as root, through an Azure run-command started by .github/workflows/deploy.yml
# (action "diagnose"). It changes nothing: it reads state and sends a few requests to localhost. Azure returns only the
# last ~4 KB of the output, so every section is short and the most useful ones come last. No secret is printed: the api
# logs (user ids) and the environment file are deliberately not read.
#
# Needed variable (set by the workflow, not secret):
#   API_BASE_URL   public address of the site; only its host name is used, for the Host-header checks
set -uo pipefail
set +x

APP_DIR=/opt/rationsmart
host="${API_BASE_URL#*://}"; host="${host%%/*}"; host="${host%%:*}"
sec() { echo; echo "== $* =="; }

sec "checkout in $APP_DIR (commit, then local changes)"
git -C "$APP_DIR" log -1 --format='%h %s' 2>&1 | cut -c1-110
git -C "$APP_DIR" status --short 2>&1 | head -8

sec "containers"
docker ps --format '{{.Names}} | {{.Image}} | {{.Status}} | {{.Ports}}' 2>&1 | cut -c1-150

sec "gateway and frontend logs (last 5 lines each)"
for name in gateway frontend; do
  c="$(docker ps --format '{{.Names}}' | grep -i "$name" | head -1)"
  [[ -n "$c" ]] && { echo "-- $c"; docker logs --tail 5 "$c" 2>&1 | cut -c1-150; }
done

sec "who listens on 80, 443, 8080"
ss -ltnp 2>/dev/null | awk 'NR==1 || /:(80|443|8080) /' | cut -c1-150

sec "host-level proxy or tunnel services (none expected)"
systemctl list-units --type=service --no-legend 2>/dev/null \
  | grep -iE 'cloudflared|caddy|nginx|apache|httpd|haproxy|traefik' | cut -c1-110 || echo "(none)"

sec "gateway nginx config: server_name, listen, return, redirect"
gw="$(docker ps --format '{{.Names}}' | grep -i gateway | head -1)"
if [[ -n "$gw" ]]; then
  docker exec "$gw" nginx -T 2>/dev/null | grep -nE 'server_name|listen|return|redirect' | head -14 | cut -c1-120
else
  echo "(no gateway container is running)"
fi

# The smoke test of deploy.sh requests http://localhost/docs and needs 404: show exactly what comes back.
for path in /docs /healthz /; do
  sec "GET http://localhost$path"
  curl -si --max-time 8 "http://localhost$path" 2>&1 | head -6 | tr -d '\r' | cut -c1-150
  if [[ -n "$host" ]]; then
    sec "GET http://localhost$path with Host: $host"
    curl -si --max-time 8 -H "Host: $host" "http://localhost$path" 2>&1 | head -6 | tr -d '\r' | cut -c1-150
  fi
done

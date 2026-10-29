#!/usr/bin/env bash
# RationSmart deploy script: backend (api/worker/beat/redis) + frontend + nginx gateway.
#
#   ./deploy.sh [up]       pull-or-build images, back up the DB, migrate, start, smoke-test
#                          (rolls back automatically if the deploy fails)
#   ./deploy.sh rollback   restart the previous images (tagged ":rollback" by the last deploy)
#   ./deploy.sh status     show container status for all three stacks
#   ./deploy.sh logs [svc] follow logs (all stacks, or one compose service)
#   ./deploy.sh down       stop all three stacks (data volumes are kept)
#
# Environment knobs:
#   IMAGE_TAG=<tag>        registry tag to pull (default: latest)
#   IMAGE_REGISTRY=<repo>  registry namespace (default: ghcr.io/ucdavis)
#   FORCE_BUILD=1          skip the registry pull and build from source
#   SKIP_GIT_PULL=1        do not `git pull --ff-only` first
#   SKIP_BACKUP=1          skip the pre-deploy pg_dump (not recommended)
#   GATEWAY_PORT=80        host port nginx listens on
#
# Needs: docker with the compose plugin, curl, flock, and backend/.env (see DEPLOYMENT.md).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK="rationsmart_edge"
STACKS=(backend frontend gateway)           # start order
APP_STACKS=(backend frontend)               # stacks whose images we build/roll back
GATEWAY_PORT="${GATEWAY_PORT:-80}"
LOG_FILE="$ROOT/deploy.log"

log()  { printf '%s [deploy] %s\n' "$(date -u +%FT%TZ)" "$*"; }
warn() { log "WARN: $*"; }
die()  { log "ERROR: $*"; exit 1; }

# dc <stack> <compose args...>: run docker compose inside a stack's directory.
dc() { local stack="$1"; shift; (cd "$ROOT/$stack" && docker compose "$@"); }

preflight() {
  command -v docker >/dev/null || die "docker not found"
  docker compose version >/dev/null 2>&1 || die "docker compose plugin not found"
  # `up --wait --wait-timeout` needs compose >= 2.20. Ubuntu's own docker.io package ships no compose
  # plugin at all; install Docker Engine from Docker's apt repo (docker-ce + docker-compose-plugin).
  local cv
  cv="$(docker compose version --short 2>/dev/null | tr -d 'v')"
  [[ "$(printf '%s\n2.20.0\n' "$cv" | sort -V | head -1)" == "2.20.0" ]] || die "docker compose $cv is too old; need >= 2.20"
  command -v curl >/dev/null || die "curl not found"
  docker info >/dev/null 2>&1 || die "cannot talk to the docker daemon (is this user in the docker group?)"

  local env_file="$ROOT/backend/.env" key
  [[ -f "$env_file" ]] || die "backend/.env is missing (copy backend/.env.example and fill it in)"
  for key in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB POSTGRES_HOST JWT_SECRET_KEY API_BASE_URL REDIS_PASSWORD; do
    grep -Eq "^${key}=.+" "$env_file" || die "backend/.env: ${key} is not set"
  done
  if grep -Eq '^POSTGRES_HOST=(host\.docker\.internal|localhost|127\.0\.0\.1)' "$env_file"; then
    warn "POSTGRES_HOST points at the VM itself; for Azure Postgres use <server>.postgres.database.azure.com"
  fi
  if grep -Eq '^POSTGRES_HOST=.*\.azure\.com' "$env_file" && ! grep -Eq '^PGSSLMODE=.+' "$env_file"; then
    warn "Azure Postgres requires TLS: add PGSSLMODE=require to backend/.env"
  fi
  [[ "$(stat -c '%a' "$env_file")" =~ ^[46]00$ ]] || warn "backend/.env is readable by others; run: chmod 600 backend/.env"

  local free_gb
  free_gb="$(df -BG --output=avail /var/lib/docker 2>/dev/null | tail -1 | tr -dc '0-9' || true)"
  if [[ -n "${free_gb:-}" && "$free_gb" -lt 5 ]]; then
    die "only ${free_gb} GB free under /var/lib/docker; need at least 5 GB to build images"
  fi
}

ensure_network() {
  docker network inspect "$NETWORK" >/dev/null 2>&1 || {
    log "creating docker network $NETWORK"
    docker network create "$NETWORK" >/dev/null
  }
}

# Tag every image the stack currently runs as <repo>:rollback so `rollback` has a target.
# Failure here is not fatal (first deploy: nothing exists yet).
snapshot_for_rollback() {
  local stack ref
  for stack in "${APP_STACKS[@]}"; do
    while read -r ref; do
      [[ -n "$ref" ]] || continue
      if docker image inspect "$ref" >/dev/null 2>&1; then
        docker tag "$ref" "${ref%:*}:rollback"
        log "rollback point: ${ref%:*}:rollback"
      fi
    done < <(dc "$stack" config --images 2>/dev/null | grep -E 'rationsmart-(api|pwa)' | sort -u || true)
  done
}

# Pull from the registry; if that fails for any reason, build from the checked-out source.
pull_or_build() {
  local stack="$1"
  if [[ "${FORCE_BUILD:-0}" == "1" ]]; then
    log "[$stack] FORCE_BUILD=1: building locally"
    dc "$stack" build
    return
  fi
  log "[$stack] pulling images"
  if ! dc "$stack" pull --quiet; then
    log "[$stack] pull failed or no registry image; building locally"
    dc "$stack" build
  fi
}

backup_db() {
  if [[ "${SKIP_BACKUP:-0}" == "1" ]]; then warn "SKIP_BACKUP=1: no pre-deploy backup"; return; fi
  local out="pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).dump"
  mkdir -p "$ROOT/backups"
  log "backing up database to backups/$out"
  # pg_dump runs inside the api image (postgresql-client is installed there).
  # Its major version must be >= the server's; if the managed Postgres runs a newer one, bump the Dockerfile.
  dc backend run --rm --no-deps -T api sh -c \
    "PGPASSWORD=\"\$POSTGRES_PASSWORD\" pg_dump -h \"\$POSTGRES_HOST\" -p \"\${POSTGRES_PORT:-5432}\" -U \"\$POSTGRES_USER\" -Fc \"\$POSTGRES_DB\" -f /backups/$out" \
    || die "database backup failed (fix it, or re-run with SKIP_BACKUP=1)"
}

migrate() {
  log "running alembic migrations"
  dc backend run --rm --no-deps -T api alembic upgrade head
}

smoke_test() {
  local base="http://localhost:${GATEWAY_PORT}" i
  log "smoke test against $base"
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null -L --max-time 5 "$base/healthz" && curl -fsS -o /dev/null -L --max-time 10 "$base/"; then
      break
    fi
    [[ "$i" == 30 ]] && { log "gateway/frontend did not answer in time"; return 1; }
    sleep 2
  done
  # The backend must be hidden from the outside, yet reachable by the app.
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$base/docs" || true)"
  [[ "$code" == "404" ]] || { log "expected 404 for /docs through the gateway, got $code"; return 1; }
  dc backend exec -T api python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)" \
    || { log "api /health failed (database or redis down?)"; return 1; }
  log "smoke test passed"
}

start_all() {
  local stack
  for stack in "${STACKS[@]}"; do
    log "[$stack] starting"
    dc "$stack" up -d --remove-orphans --wait --wait-timeout 180
  done
}

# Runs in its own process (`deploy.sh _deploy`) so `set -e` really aborts on the first
# failure; inside an `if` condition bash would silently disable it.
do_deploy() {
  preflight
  ensure_network

  if [[ "${SKIP_GIT_PULL:-0}" != "1" && -d "$ROOT/.git" ]]; then
    log "git pull --ff-only"
    git -C "$ROOT" pull --ff-only || die "git pull failed (local changes or diverged branch); fix, or use SKIP_GIT_PULL=1"
  fi
  [[ -d "$ROOT/.git" ]] && log "deploying commit $(git -C "$ROOT" rev-parse --short HEAD)"

  snapshot_for_rollback
  local stack
  for stack in "${STACKS[@]}"; do pull_or_build "$stack"; done

  backup_db
  migrate
  start_all
  smoke_test
  log "deploy OK"
}

do_rollback() {
  ensure_network
  local stack ok=1
  for stack in "${APP_STACKS[@]}"; do
    log "[$stack] rolling back to :rollback images"
    # IMAGE_TAG=rollback selects the tags snapshot_for_rollback created; --no-build keeps compose
    # from rebuilding over them. Database migrations are NOT reverted (restore backups/*.dump if needed).
    IMAGE_TAG=rollback dc "$stack" up -d --no-build --wait --wait-timeout 180 || ok=0
  done
  dc gateway up -d --wait --wait-timeout 60 || ok=0
  if [[ "$ok" == 1 ]] && smoke_test; then
    log "rollback OK"
  else
    die "rollback failed; inspect with: ./deploy.sh status / ./deploy.sh logs"
  fi
}

main() {
  local cmd="${1:-up}"
  [[ $# -gt 0 ]] && shift

  case "$cmd" in
    _deploy) do_deploy; return ;;      # internal: child process for `up`
    status)
      for s in "${STACKS[@]}"; do echo "== $s =="; dc "$s" ps; done; return ;;
    logs)
      if [[ $# -gt 0 ]]; then
        for s in "${STACKS[@]}"; do
          dc "$s" config --services 2>/dev/null | grep -qx "$1" && { dc "$s" logs -f --tail=200 "$1"; return; }
        done
        die "no compose service named $1"
      fi
      for s in "${STACKS[@]}"; do dc "$s" logs --tail=50; done; return ;;
    down)
      for ((i=${#STACKS[@]}-1; i>=0; i--)); do dc "${STACKS[i]}" down; done; return ;;
    up|rollback) ;;
    *) sed -n '2,19p' "${BASH_SOURCE[0]}"; exit 2 ;;
  esac

  # Mutating commands: one at a time, and everything is also written to deploy.log.
  command -v flock >/dev/null || die "flock not found"
  exec 9>"$ROOT/.deploy.lock"
  flock -n 9 || die "another deploy is already running"
  exec > >(tee -a "$LOG_FILE") 2>&1

  if [[ "$cmd" == "rollback" ]]; then do_rollback; return; fi

  if ! "${BASH_SOURCE[0]}" _deploy; then
    log "deploy FAILED; collecting logs and rolling back"
    for s in "${STACKS[@]}"; do dc "$s" ps || true; done
    dc backend logs --tail=40 api || true
    do_rollback || true
    exit 1
  fi
}

main "$@"

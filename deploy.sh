#!/usr/bin/env bash
# RationSmart deploy script: backend (api/worker/beat/redis) + frontend + nginx gateway.
#
#   ./deploy.sh [up]       pull-or-build images, back up the DB, migrate, start, smoke-test
#                          (rolls back automatically if the deploy fails)
#   ./deploy.sh rollback   restart the previous images (tagged ":rollback" by the last deploy)
#   ./deploy.sh status     show container status for all three stacks
#   ./deploy.sh logs [svc] follow logs (all stacks, or one compose service)
#   ./deploy.sh down       stop all three stacks (data volumes are kept)
#   ./deploy.sh seed [--dry-run] [--mode update] [--pack /packs/master/<version>]
#                          load the reference data pack (countries, feed types/categories, feeds,
#                          translations) into the database; backs up first unless --dry-run
#   ./deploy.sh create-admin --email E --name N --country-code ETH [--pin-stdin] [--promote] [--force]
#                          create the first super admin (the PIN is asked for, never stored in a file)
#
# Environment knobs:
#   EXPECT_DB=<name>       refuse to run unless backend/.env points at this database
#   IMAGE_TAG=<tag>        registry tag to pull (default: latest)
#   IMAGE_REGISTRY=<repo>  registry namespace (default: ghcr.io/your-org, a placeholder: set your own to pull images)
#                          IMAGE_REGISTRY and IMAGE_TAG can also be set in backend/.env
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

# IMAGE_REGISTRY / IMAGE_TAG may be set in backend/.env (a variable given on the command line wins).
# Exported so the backend and the frontend stack both use the same registry.
for _k in IMAGE_REGISTRY IMAGE_TAG; do
  if [[ -z "${!_k:-}" && -f "$ROOT/backend/.env" ]]; then
    _v="$(grep -E "^${_k}=" "$ROOT/backend/.env" | tail -1 | cut -d= -f2- | tr -d "'\"" || true)"
    [[ -n "$_v" ]] && export "$_k=$_v"
  fi
done
unset _k _v

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
  for key in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB POSTGRES_HOST JWT_SECRET_KEY API_BASE_URL; do
    grep -Eq "^${key}=.+" "$env_file" || die "backend/.env: ${key} is not set"
  done
  # Show which database the migrations will run against (names only, never credentials), and
  # optionally refuse to continue unless it is the expected one: EXPECT_DB=rationsmart_dev ./deploy.sh
  local target_host target_db
  target_host="$(grep -E '^POSTGRES_HOST=' "$env_file" | tail -1 | cut -d= -f2- | tr -d "'\"")"
  target_db="$(grep -E '^POSTGRES_DB=' "$env_file" | tail -1 | cut -d= -f2- | tr -d "'\"")"
  log "target database: ${target_db} on ${target_host}"
  if [[ -n "${EXPECT_DB:-}" && "$target_db" != "$EXPECT_DB" ]]; then
    die "EXPECT_DB=${EXPECT_DB} but backend/.env points at '${target_db}'; refusing to continue"
  fi
  # Redis: either the bundled one (needs a password) or a managed one via EXTERNAL_REDIS_URL.
  grep -Eq "^(REDIS_PASSWORD|EXTERNAL_REDIS_URL)=.+" "$env_file" \
    || die "backend/.env: set REDIS_PASSWORD (bundled Redis) or EXTERNAL_REDIS_URL (managed Redis)"
  if grep -Eq '^POSTGRES_HOST=(host\.docker\.internal|localhost|127\.0\.0\.1)' "$env_file"; then
    warn "POSTGRES_HOST points at the VM itself; for Azure Postgres use <server>.postgres.database.azure.com"
  fi
  if grep -Eq '^POSTGRES_HOST=.*\.azure\.com' "$env_file" && ! grep -Eq '^PGSSLMODE=.+' "$env_file"; then
    warn "Azure Postgres requires TLS: add PGSSLMODE=require to backend/.env"
  fi
  [[ "$(stat -c '%a' "$env_file")" =~ ^[46]00$ ]] || warn "backend/.env is readable by others; run: chmod 600 backend/.env"
  # Compose expands $NAME in .env values (also in env_file), replacing unknown names with "" -- so a
  # secret like abc$XyZ reaches the containers as "abc". Single quotes or $$ keep the value literal.
  local dollar_keys
  dollar_keys="$(grep -E "^[A-Za-z_][A-Za-z0-9_]*=[^']*[$][A-Za-z_{]" "$env_file" | cut -d= -f1 | paste -sd, - || true)"
  [[ -z "$dollar_keys" ]] || warn "backend/.env: value(s) of ${dollar_keys} contain \$NAME, which compose expands to blank; wrap them in single quotes ('...') or write \$\$"

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

# Tag the images the app containers are running right now as <repo>:rollback, so `rollback`
# has a target. This goes by the running containers' image IDs, not by the :latest tag, because
# a pull or build later in this deploy (or a failed earlier one) moves :latest to a new image.
# First deploy: nothing is running, so there is no rollback point (and nothing to roll back to).
snapshot_for_rollback() {
  local stack cid ref id
  local -A seen=()                     # api/worker/beat share one image: tag and log it once
  for stack in "${APP_STACKS[@]}"; do
    while read -r cid; do
      [[ -n "$cid" ]] || continue
      read -r ref id < <(docker inspect --format '{{.Config.Image}} {{.Image}}' "$cid")
      [[ -z "${seen[$ref]:-}" ]] || continue
      seen[$ref]=1
      case "$ref" in
        *rationsmart-api:*|*rationsmart-pwa:*)
          docker tag "$id" "${ref%:*}:rollback"
          log "rollback point: ${ref%:*}:rollback -> ${id:7:12}" ;;
      esac
    done < <(dc "$stack" ps -q 2>/dev/null || true)
  done
}

# True when every app image has a local :rollback tag.
have_rollback_point() {
  local stack ref
  for stack in "${APP_STACKS[@]}"; do
    while read -r ref; do
      case "$ref" in
        *rationsmart-api:*|*rationsmart-pwa:*)
          docker image inspect "${ref%:*}:rollback" >/dev/null 2>&1 || return 1 ;;
      esac
    done < <(dc "$stack" config --images 2>/dev/null | sort -u)
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
  # POSTGRES_PASSWORD is spliced unescaped into the app's database URL, so a password with URL-reserved
  # characters must be stored percent-encoded in .env. SQLAlchemy decodes it for the app; pg_dump takes
  # PGPASSWORD literally, so decode it here the same way (a plain password is unchanged by this).
  local dump_cmd
  read -r -d '' dump_cmd <<EOF || true
PGPASSWORD="\$(python -c 'import os, urllib.parse as u; print(u.unquote(os.environ["POSTGRES_PASSWORD"]), end="")')" \
pg_dump -h "\$POSTGRES_HOST" -p "\${POSTGRES_PORT:-5432}" -U "\$POSTGRES_USER" -Fc "\$POSTGRES_DB" -f /backups/$out
EOF
  dc backend run --rm --no-deps -T api sh -c "$dump_cmd" \
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
  # The gateway config is bind-mounted, so editing it does not recreate the container; reload to apply.
  dc gateway exec -T nginx sh -c 'nginx -t && nginx -s reload' >/dev/null
}

# A deploy is two phases, each run as its own process (`deploy.sh _prepare` / `_apply`) so that
# `set -e` really aborts on the first failure (inside an `if` condition bash silently disables it):
#   _prepare  everything that leaves the running stack untouched: checks, git, images, backup.
#             A failure here means nothing changed, so there is nothing to roll back.
#   _apply    migrate, (re)start, smoke test. A failure here triggers the automatic rollback.
do_prepare() {
  preflight
  ensure_network

  if [[ "${SKIP_GIT_PULL:-0}" != "1" && -d "$ROOT/.git" ]]; then
    if git -C "$ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
      log "git pull --ff-only"
      git -C "$ROOT" pull --ff-only || die "git pull failed (local changes or diverged branch); fix, or use SKIP_GIT_PULL=1"
    else
      warn "branch '$(git -C "$ROOT" branch --show-current)' has no upstream; skipping git pull (deploying the checked-out code)"
    fi
  fi
  [[ ! -d "$ROOT/.git" ]] || log "deploying commit $(git -C "$ROOT" rev-parse --short HEAD)"

  snapshot_for_rollback
  local stack
  for stack in "${STACKS[@]}"; do pull_or_build "$stack"; done

  backup_db
}

# A deploy builds the schema but loads no data. Say so when the database is still empty, so the next step is not missed.
remind_if_empty() {
  local n
  n="$(dc backend exec -T api python -c "import psycopg2; from app.config import settings; c = psycopg2.connect(settings.database_url); cur = c.cursor(); cur.execute('select count(*) from country'); print(cur.fetchone()[0])" 2>/dev/null | tail -1 || true)"
  if [[ "$n" == "0" ]]; then
    log "NOTE: the database has no data yet (a deploy only creates the structure)."
    log "NOTE: next, load the reference data:  ./deploy.sh seed --dry-run   then   ./deploy.sh seed"
    log "NOTE: then create the first admin:    ./deploy.sh create-admin --email <email> --name <name> --country-code ETH"
  fi
}

do_apply() {
  migrate
  start_all
  smoke_test
  log "deploy OK"
  remind_if_empty
}

do_rollback() {
  ensure_network
  # Never roll back into a half-state: without a :rollback image for every app service (first
  # deploy, or the stack was not running) compose would try to pull one and leave things mixed.
  have_rollback_point || die "no :rollback image for every app service (first deploy, or the images were removed), so there is nothing to roll back to; the containers from this deploy are left running as-is for inspection (./deploy.sh status / logs)"
  local stack ok=1
  for stack in "${APP_STACKS[@]}"; do
    log "[$stack] rolling back to :rollback images"
    # IMAGE_TAG=rollback selects the tags snapshot_for_rollback created; --no-build/--pull never keep
    # compose from rebuilding or fetching over them. Database migrations are NOT reverted (restore
    # backups/*.dump if needed).
    IMAGE_TAG=rollback dc "$stack" up -d --no-build --pull never --wait --wait-timeout 180 || ok=0
  done
  dc gateway up -d --wait --wait-timeout 60 || ok=0
  if [[ "$ok" == 1 ]] && smoke_test; then
    log "rollback OK"
  else
    die "rollback failed; inspect with: ./deploy.sh status / ./deploy.sh logs"
  fi
}

# Load the data pack. A load has no downgrade, so the pre-change pg_dump (backup_db) is the way back; a
# dry run writes nothing and skips it. Arguments go to scripts_2.load_data_pack.
do_seed() {
  preflight
  ensure_network
  local a dry=0
  for a in "$@"; do [[ "$a" == "--dry-run" ]] && dry=1; done
  [[ "$dry" == 1 ]] || backup_db
  if [[ "$dry" == 1 ]]; then log "loading the data pack (dry run: nothing is written)"; else log "loading the data pack"; fi
  dc backend run --rm --no-deps -T api python -m scripts_2.load_data_pack "$@"
}

# First admin. Interactive (the PIN prompt needs a terminal) unless --pin-stdin is given.
do_create_admin() {
  preflight
  ensure_network
  local a tty=()
  for a in "$@"; do [[ "$a" == "--pin-stdin" ]] && tty=(-T); done
  dc backend run --rm --no-deps ${tty[@]+"${tty[@]}"} api python -m scripts_2.create_admin "$@"
}

main() {
  local cmd="${1:-up}"
  [[ $# -gt 0 ]] && shift

  case "$cmd" in
    _prepare) do_prepare; return ;;    # internal: child processes for `up`
    _apply)   do_apply; return ;;
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
    up|rollback|seed|create-admin) ;;
    *) sed -n '2,26p' "${BASH_SOURCE[0]}"; exit 2 ;;
  esac

  # Mutating commands: one at a time, and everything is also written to deploy.log.
  command -v flock >/dev/null || die "flock not found"
  exec 9>"$ROOT/.deploy.lock"
  flock -n 9 || die "another deploy is already running"
  # create-admin prompts for the PIN on the terminal, so it keeps its own stdout (and is not logged).
  if [[ "$cmd" == "create-admin" ]]; then do_create_admin "$@"; return; fi
  exec > >(tee -a "$LOG_FILE") 2>&1

  if [[ "$cmd" == "seed" ]]; then do_seed "$@"; return; fi
  if [[ "$cmd" == "rollback" ]]; then do_rollback; return; fi

  if ! "${BASH_SOURCE[0]}" _prepare; then
    log "deploy ABORTED before any change was made; the running stack is untouched (no rollback needed)"
    exit 1
  fi
  if ! "${BASH_SOURCE[0]}" _apply; then
    log "deploy FAILED; collecting logs and rolling back"
    for s in "${STACKS[@]}"; do dc "$s" ps || true; done
    dc backend logs --tail=40 api || true
    do_rollback || true
    exit 1
  fi
}

main "$@"

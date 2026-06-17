#!/usr/bin/env bash
# deploy_test.sh — Deploy RationSmart to the Test environment
#
# Usage:
#   ./scripts/deploy_test.sh            # deploys main branch
#   ./scripts/deploy_test.sh v3.0       # deploys a specific branch

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
SERVER_USER="ubuntu"
SERVER_HOST="47.128.1.51"
SERVER_DIR="rationsmart"           # relative to the SSH user's home directory
BRANCH="${1:-main}"                # default branch; override via first argument
API_PORT=8000
HEALTH_URL="http://${SERVER_HOST}:${API_PORT}/health"
HEALTH_RETRIES=20                  # number of attempts (x 3s = 60s max wait)

# Required keys that must exist in the server's .env
REQUIRED_ENV_KEYS=(
  POSTGRES_USER
  POSTGRES_PASSWORD
  POSTGRES_DB
  POSTGRES_HOST
  SMTP_USERNAME
  SMTP_PASSWORD
  FROM_EMAIL
  JWT_SECRET_KEY
  API_BASE_URL
)

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }
step()    { echo -e "\n${BOLD}${CYAN}==> $*${NC}"; }
die()     { error "$*"; exit 1; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║     RationSmart — Test Environment Deploy    ║"
echo "  ╚══════════════════════════════════════════════╝"
echo -e "${NC}"
info "Server  : ${SERVER_USER}@${SERVER_HOST}"
info "Branch  : ${BRANCH}"
info "Started : $(date '+%Y-%m-%d %H:%M:%S')"

# ── Step 1: Check SSH connectivity ───────────────────────────────────────────
step "Checking SSH connectivity"
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes \
        "${SERVER_USER}@${SERVER_HOST}" "echo ok" &>/dev/null; then
  die "Cannot reach ${SERVER_USER}@${SERVER_HOST}. Check VPN/SSH key."
fi
success "SSH connection OK"

# ── Step 2: Validate .env on server ──────────────────────────────────────────
step "Validating .env on server"
MISSING_KEYS=()
for KEY in "${REQUIRED_ENV_KEYS[@]}"; do
  FOUND=$(ssh "${SERVER_USER}@${SERVER_HOST}" \
    "grep -c '^${KEY}=' ~/${SERVER_DIR}/.env 2>/dev/null || echo 0")
  if [[ "$FOUND" == "0" ]]; then
    MISSING_KEYS+=("$KEY")
  fi
done

if [[ ${#MISSING_KEYS[@]} -gt 0 ]]; then
  error "The following required keys are missing from the server .env:"
  for KEY in "${MISSING_KEYS[@]}"; do
    echo -e "    ${RED}✗${NC} ${KEY}"
  done
  die "Fix the .env file on the server before deploying."
fi
success "All required .env keys are present"

# ── Step 3: Pull latest code on server ───────────────────────────────────────
step "Pulling latest code (branch: ${BRANCH})"
ssh "${SERVER_USER}@${SERVER_HOST}" bash <<EOF
  set -euo pipefail
  cd ~/${SERVER_DIR}

  # Ensure we are on the right branch
  git fetch origin
  git checkout ${BRANCH}
  git pull origin ${BRANCH}
  echo "Git HEAD: \$(git log -1 --oneline)"
EOF
success "Code updated"

# ── Step 4: Rebuild and restart services ─────────────────────────────────────
step "Rebuilding api + worker containers (redis untouched)"
ssh "${SERVER_USER}@${SERVER_HOST}" bash <<EOF
  set -euo pipefail
  cd ~/${SERVER_DIR}

  # Rebuild only api and worker; redis keeps running
  docker compose up -d --build api worker
EOF
success "Containers started"

# ── Step 5: Wait for health check ────────────────────────────────────────────
step "Waiting for API to become healthy"
ATTEMPT=0
until curl -sf "${HEALTH_URL}" | grep -q '"status"'; do
  ATTEMPT=$((ATTEMPT + 1))
  if [[ $ATTEMPT -ge $HEALTH_RETRIES ]]; then
    error "Health check failed after $((ATTEMPT * 3))s."
    echo ""
    warn "Last 30 lines of api logs:"
    ssh "${SERVER_USER}@${SERVER_HOST}" \
      "cd ~/${SERVER_DIR} && docker compose logs --tail=30 api"
    die "Deployment failed — API did not become healthy."
  fi
  info "  Attempt ${ATTEMPT}/${HEALTH_RETRIES} — waiting 3s..."
  sleep 3
done

HEALTH_RESPONSE=$(curl -sf "${HEALTH_URL}")
DB_STATUS=$(echo "$HEALTH_RESPONSE"    | grep -o '"database":"[^"]*"' | cut -d'"' -f4)
CACHE_STATUS=$(echo "$HEALTH_RESPONSE" | grep -o '"cache":"[^"]*"'    | cut -d'"' -f4)
API_VERSION=$(echo "$HEALTH_RESPONSE"  | grep -o '"version":"[^"]*"'  | cut -d'"' -f4)

success "API is healthy (version: ${API_VERSION})"
info    "  Database : ${DB_STATUS}"
info    "  Cache    : ${CACHE_STATUS}"

# ── Step 6: Show running containers ──────────────────────────────────────────
step "Container status"
ssh "${SERVER_USER}@${SERVER_HOST}" \
  "cd ~/${SERVER_DIR} && docker compose ps"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ✓ Deployment complete!${NC}"
echo -e "  Swagger UI : ${CYAN}http://${SERVER_HOST}:${API_PORT}/docs${NC}"
echo -e "  Health     : ${CYAN}${HEALTH_URL}${NC}"
echo -e "  Finished   : $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

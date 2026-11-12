#!/usr/bin/env bash
# Release script that runs ON the VM, as root, through an Azure run-command started by
# .github/workflows/deploy.yml. The workflow puts the lines "export NAME=value" in front of this file.
# It builds backend/.env from Key Vault and those values, then hands over to ./deploy.sh.
#
# Needed variables (set by the workflow, none of them secret):
#   DEPLOY_ACTION      up | rollback
#   RELEASE_SHA        git commit to deploy (up only)
#   ACR_LOGIN_SERVER   registry address, for example myregistry.azurecr.io
#   KEY_VAULT_NAME     vault that holds postgres-password, jwt-secret-key, redis-password, smtp-password
#   POSTGRES_HOST  POSTGRES_USER  POSTGRES_DB
#   SMTP_SERVER  SMTP_PORT  SMTP_USERNAME  FROM_EMAIL
#   API_BASE_URL  ALLOWED_ORIGINS   (optional: default to http://<this VM's public address>)
set -euo pipefail
set +x   # never trace: secrets pass through this script

APP_DIR=/opt/rationsmart
: "${DEPLOY_ACTION:=up}"

need() { local n; for n in "$@"; do [[ -n "${!n:-}" ]] || { echo "missing variable: $n" >&2; exit 2; }; done; }
need ACR_LOGIN_SERVER KEY_VAULT_NAME POSTGRES_HOST POSTGRES_USER POSTGRES_DB SMTP_SERVER SMTP_PORT SMTP_USERNAME FROM_EMAIL
[[ "$DEPLOY_ACTION" != "up" ]] || need RELEASE_SHA

# First boot installs Docker, git and the Azure CLI (infra/cloud-init.yaml); wait for it instead of failing the first release.
cloud-init status --wait >/dev/null 2>&1 || true
[[ -f /var/lib/rationsmart-bootstrap.done ]] || { echo "first-boot setup has not finished; see /var/log/cloud-init-output.log" >&2; exit 1; }

az login --identity --output none
az acr login --name "${ACR_LOGIN_SERVER%%.*}"

secret() { az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$1" --query value --output tsv; }

# The VM's own public address, for API_BASE_URL / ALLOWED_ORIGINS when the workflow did not set them.
if [[ -z "${API_BASE_URL:-}" || -z "${ALLOWED_ORIGINS:-}" ]]; then
  ip="$(curl -fsS -H 'Metadata:true' 'http://169.254.169.254/metadata/instance/network/interface/0/ipv4/ipAddress/0/publicIpAddress?api-version=2021-02-01&format=text')"
  : "${API_BASE_URL:=http://$ip}"
  : "${ALLOWED_ORIGINS:=http://$ip}"
fi

cd "$APP_DIR"

if [[ "$DEPLOY_ACTION" == "up" ]]; then
  git fetch --quiet origin
  git checkout --quiet --detach "$RELEASE_SHA"
  echo "checked out $(git rev-parse --short HEAD)"
fi

# Values go between single quotes so compose does not expand a "$" in them; a single quote cannot be quoted that way.
q() { [[ "$1" != *"'"* ]] || { echo "a value for $2 contains a single quote, which .env cannot hold" >&2; exit 2; }; printf "'%s'" "$1"; }

env_tmp="$(umask 077 && mktemp "$APP_DIR/backend/.env.XXXXXX")"
trap 'rm -f "$env_tmp"' EXIT
{
  echo "POSTGRES_HOST=$(q "$POSTGRES_HOST" POSTGRES_HOST)"
  echo "POSTGRES_PORT=5432"
  echo "POSTGRES_USER=$(q "$POSTGRES_USER" POSTGRES_USER)"
  echo "POSTGRES_PASSWORD=$(q "$(secret postgres-password)" postgres-password)"
  echo "POSTGRES_DB=$(q "$POSTGRES_DB" POSTGRES_DB)"
  echo "PGSSLMODE=require"
  echo "REDIS_PASSWORD=$(q "$(secret redis-password)" redis-password)"
  echo "JWT_SECRET_KEY=$(q "$(secret jwt-secret-key)" jwt-secret-key)"
  echo "API_BASE_URL=$(q "$API_BASE_URL" API_BASE_URL)"
  echo "ALLOWED_ORIGINS=$(q "$ALLOWED_ORIGINS" ALLOWED_ORIGINS)"
  echo "SMTP_SERVER=$(q "$SMTP_SERVER" SMTP_SERVER)"
  echo "SMTP_PORT=$(q "$SMTP_PORT" SMTP_PORT)"
  echo "SMTP_USERNAME=$(q "$SMTP_USERNAME" SMTP_USERNAME)"
  echo "SMTP_PASSWORD=$(q "$(secret smtp-password)" smtp-password)"
  echo "FROM_EMAIL=$(q "$FROM_EMAIL" FROM_EMAIL)"
  echo "IMAGE_REGISTRY=$ACR_LOGIN_SERVER"
  [[ "$DEPLOY_ACTION" != "up" ]] || echo "IMAGE_TAG=$RELEASE_SHA"
} > "$env_tmp"
chmod 600 "$env_tmp"
mv -f "$env_tmp" backend/.env
trap - EXIT

# deploy.sh refuses to run when backend/.env points at another database.
export EXPECT_DB="$POSTGRES_DB" SKIP_GIT_PULL=1
if [[ "$DEPLOY_ACTION" == "rollback" ]]; then
  ./deploy.sh rollback
else
  ./deploy.sh
fi

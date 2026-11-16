#!/usr/bin/env bash
# Data script that runs ON the VM, as root, through an Azure run-command started by .github/workflows/data.yml.
# The workflow puts the lines "export NAME=value" in front of this file. It checks out the commit that holds the
# data pack (the packs are mounted into the api container from the checkout) and runs ./deploy.sh seed against
# the database in backend/.env, which the last release wrote. No secret passes through here.
#
# Needed variables (set by the workflow, none of them secret):
#   DATA_ACTION   seed-dry-run | seed | create-admin
#   RELEASE_SHA   git commit that holds the pack
#   POSTGRES_DB   the database name; deploy.sh refuses to run when backend/.env points at another one
# create-admin also needs ADMIN_EMAIL, ADMIN_NAME, ADMIN_PIN (secrets: the workflow masks them in its log) and
# ADMIN_COUNTRY_CODE. Their values are never echoed here.
set -euo pipefail
set +x

APP_DIR=/opt/rationsmart
need() { local n; for n in "$@"; do [[ -n "${!n:-}" ]] || { echo "missing variable: $n" >&2; exit 2; }; done; }
need DATA_ACTION RELEASE_SHA POSTGRES_DB

[[ -f "$APP_DIR/backend/.env" ]] || { echo "backend/.env is missing: run the Deploy workflow first" >&2; exit 1; }

cd "$APP_DIR"
git fetch --quiet origin
git checkout --quiet --detach "$RELEASE_SHA"
echo "checked out $(git rev-parse --short HEAD)"

export EXPECT_DB="$POSTGRES_DB" SKIP_GIT_PULL=1
case "$DATA_ACTION" in
  seed-dry-run) ./deploy.sh seed --dry-run ;;
  seed)         ./deploy.sh seed ;;
  create-admin)
    need ADMIN_EMAIL ADMIN_NAME ADMIN_PIN ADMIN_COUNTRY_CODE
    [[ "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || { echo "ADMIN_EMAIL is not a valid email address" >&2; exit 2; }
    (( ${#ADMIN_NAME} >= 1 && ${#ADMIN_NAME} <= 100 )) || { echo "ADMIN_NAME must be 1-100 characters" >&2; exit 2; }
    [[ "$ADMIN_COUNTRY_CODE" =~ ^[A-Z]{3}$ ]] || { echo "admin_country_code must be 3 capital letters" >&2; exit 2; }
    [[ "$ADMIN_PIN" =~ ^[0-9]{6}$ ]] || { echo "ADMIN_PIN must be exactly 6 digits" >&2; exit 2; }
    # The PIN goes in on stdin: never on a command line. deploy.sh runs the container without a terminal for --pin-stdin.
    printf '%s\n' "$ADMIN_PIN" | ./deploy.sh create-admin --email "$ADMIN_EMAIL" --name "$ADMIN_NAME" \
      --country-code "$ADMIN_COUNTRY_CODE" --pin-stdin ;;
  *) echo "unknown DATA_ACTION: $DATA_ACTION" >&2; exit 2 ;;
esac

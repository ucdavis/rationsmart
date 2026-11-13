#!/usr/bin/env bash
# Data script that runs ON the VM, as root, through an Azure run-command started by .github/workflows/data.yml.
# The workflow puts the lines "export NAME=value" in front of this file. It checks out the commit that holds the
# data pack (the packs are mounted into the api container from the checkout) and runs ./deploy.sh seed against
# the database in backend/.env, which the last release wrote. No secret passes through here.
#
# Needed variables (set by the workflow, none of them secret):
#   DATA_ACTION   seed-dry-run | seed
#   RELEASE_SHA   git commit that holds the pack
#   POSTGRES_DB   the database name; deploy.sh refuses to run when backend/.env points at another one
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
  *) echo "unknown DATA_ACTION: $DATA_ACTION" >&2; exit 2 ;;
esac

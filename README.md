# RationSmart

Least-cost dairy-cattle ration formulation: an API that optimizes and
evaluates diets, and a Progressive Web App that farmers and extension workers
use.

| Folder | What it is | Stack |
|---|---|---|
| [`backend/`](backend/) | API, optimization engine, reports, feed-library sync | FastAPI, PostgreSQL, Celery + Redis, pymoo |
| [`frontend/`](frontend/) | PWA (web app); see [`frontend/README.md`](frontend/README.md) | Next.js 14, React 18, TypeScript |

## Getting started

Backend (from `backend/`, needs a `.env` copied from `.env.example`):

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Frontend (from `frontend/`, needs a `.env.development` copied from `.env.example`):

```bash
npm install
npm run dev        # http://localhost:3000
```

## Deploying on a server

Run the whole app (web app, API, background workers, Redis and an nginx gateway) on one Ubuntu 24.04 server with a managed
PostgreSQL. Start with the deployment guide; the other two files are the settings reference and the one command that does the work.

| File | What it is |
|---|---|
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | **Start here.** Step-by-step guide from an empty server to a running app: install Docker, prepare the database, configure, deploy, load the reference data and create the first admin |
| [`CONFIGURATION.md`](CONFIGURATION.md) | Every setting in `backend/.env` (required and optional), using a managed Redis, changing the port, deploy options and data-loading options |
| [`deploy.sh`](deploy.sh) | The single command that deploys: builds (or pulls) the images, backs up the database, applies migrations, starts everything and tests it, rolling back if it fails. Also `rollback`, `status`, `logs`, `down`, `seed` (load reference data) and `create-admin` |

| [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md) | Azure only: create the whole environment (VM, PostgreSQL, registry, Key Vault) from Bicep templates in [`infra/`](infra/) and release from GitHub Actions with OIDC sign-in, using `deploy.sh` on the VM |

Quick start: `cp backend/env.template backend/.env`, fill it in (see `CONFIGURATION.md`), then run `./deploy.sh`.
Something went wrong? See [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md).

## Contributing

- `main` is protected: work on a branch and open a pull request.
- CI: CodeQL and dependency review on every PR; the frontend quality gate
  (`.github/workflows/frontend-quality-gate.yml`) runs when `frontend/` changes.
- Code owners: [`.github/CODEOWNERS`](.github/CODEOWNERS).
- Security issues: see [`SECURITY.md`](SECURITY.md).

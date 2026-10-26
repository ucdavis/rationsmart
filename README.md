# RationSmart

Least-cost dairy-cattle ration formulation: an API that optimizes and
evaluates diets, and a Progressive Web App that farmers and extension workers
use.

| Folder | What it is | Stack |
|---|---|---|
| [`backend/`](backend/) | API, optimization engine, reports, feed-library sync | FastAPI, PostgreSQL, Celery + Redis, pymoo |
| [`frontend/`](frontend/) | PWA (web app); see [`frontend/README.md`](frontend/README.md) | Next.js 16, React 19, TypeScript |

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

## Contributing

- `main` is protected: work on a branch and open a pull request.
- CI: CodeQL and dependency review on every PR; the frontend quality gate
  (`.github/workflows/frontend-quality-gate.yml`) runs when `frontend/` changes.
- Code owners: [`.github/CODEOWNERS`](.github/CODEOWNERS).
- Security issues: see [`SECURITY.md`](SECURITY.md).

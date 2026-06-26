# RationSmart — Deployment Runbook

This document covers the full deploy cycle: committing code locally and deploying to the server.
Use it whenever a new feature branch needs to go live.

---

## Part A — Local: Commit and Push to GitHub

### 1. Stage files explicitly (never use `git add .` blindly)

```bash
cd /Users/satishchandra/ucdapp/rationsmart

git add <file1> <file2> ...    # list every changed file you want to include
git status                     # verify — check "Changes to be committed" is correct
```

### 2. Commit

```bash
git commit -m "feat: <short description of what changed>"
```

### 3. Push

```bash
git push origin main
```

---

## Part B — Server: Deploy to 47.128.1.51

### Prerequisites
- SSH access to `47.128.1.51`
- Know the directory where rationsmart is cloned on the server (e.g., `~/rationsmart`)

### Step 1 — SSH into the server

```bash
ssh <user>@47.128.1.51
```

### Step 2 — Navigate to the project directory

```bash
cd ~/rationsmart          # adjust path if different
```

### Step 3 — Pull latest code from GitHub

```bash
git pull origin main
```

### Step 4 — Build the new Docker image

This rebuilds the `api` and `worker` images with the latest code. Does NOT restart containers yet.

```bash
docker compose build
```

### Step 5 — Run database migration (if any)

Check if there is a new Alembic migration file in `alembic/versions/` compared to what was
previously deployed. If yes, run:

```bash
docker compose run --rm api alembic upgrade head
```

- `--rm` means the one-off container is destroyed after the command finishes.
- This is safe to run while the old API container is still serving traffic — migrations only
  add tables/columns, never drop them.
- If you are unsure whether a migration is needed, running this command when there's nothing
  new is harmless — Alembic is idempotent.

### Step 6 — Seed reference data (first deploy only, or when new seed data is added)

```bash
docker compose run --rm api python scripts/seed_languages.py
```

- This inserts baseline language rows (English, etc.).
- Idempotent — safe to re-run; it will not duplicate rows.
- Only needed on first deploy or when a new language seed is added to the script.

### Step 7 — Restart all services with the new image

```bash
docker compose up -d
```

- `-d` runs in detached (background) mode.
- This restarts `api`, `worker`, and `redis` containers using the newly built image.
- Existing `redis_data` volume is preserved — no cache data is lost.

### Step 8 — Verify

```bash
# Check all 3 containers are running
docker compose ps

# Tail API logs for startup errors
docker compose logs api --tail=50

# Quick health check
curl http://localhost:8000/v1/admin/languages
# Expected: {"success": true, "languages": [...]}
```

---

## Part C — Rollback (if something goes wrong)

### Option 1: Roll back code only (no DB change)

```bash
git log --oneline -5            # identify the previous good commit hash
git checkout <previous-hash>    # detached HEAD — only for reference
# or
git revert HEAD                 # creates a new revert commit
git push origin main
docker compose build && docker compose up -d
```

### Option 2: Roll back a migration

```bash
# Find the previous revision ID from alembic/versions/
docker compose run --rm api alembic downgrade -1
```

Then roll back the code (Option 1 above).

---

## Part D — Useful Docker Commands

| Command | Purpose |
|---|---|
| `docker compose ps` | List running containers and their status |
| `docker compose logs api --tail=100 -f` | Follow live API logs |
| `docker compose logs worker --tail=50` | Worker (Celery) logs |
| `docker compose down` | Stop and remove containers (volumes preserved) |
| `docker compose down -v` | Stop and remove containers AND volumes (⚠️ clears Redis data) |
| `docker compose exec api bash` | Open a shell inside the running API container |
| `docker compose run --rm api alembic current` | Show which migration is currently applied |
| `docker compose run --rm api alembic history` | Show full migration history |

---

## Part E — Environment File (`.env`) Checklist

The `.env` file lives on the server only (never committed to git). Ensure these keys are present
before the first deploy:

```
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_HOST=host.docker.internal
POSTGRES_PORT=9900
POSTGRES_DB=...
JWT_SECRET_KEY=...              # generate a strong random secret
REDIS_URL=redis://redis:6379/0
OPTIMIZATION_POOL_WORKERS=2
ALLOWED_ORIGINS=http://47.128.1.51:8000
ALLOW_INFEASIBLE_REPORTS=false
NSGA3_VERBOSE=false
WORKERS=3
API_BASE_URL=http://47.128.1.51:8000
```

---

## Summary: Normal Deploy in 5 Commands

```bash
# On your laptop
git add <files> && git commit -m "..." && git push origin main

# On the server (SSH in first)
git pull origin main
docker compose build
docker compose run --rm api alembic upgrade head   # skip if no new migration
docker compose up -d
```

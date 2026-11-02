# Deployment runbook (single Ubuntu 24.04 VM + managed PostgreSQL)

```
Internet :80 -> nginx (gateway/)            only published port
                 ├─ /                       -> frontend:3000   (Next.js, proxies /api/proxy/* to the API)
                 ├─ = /v1/auth/verify-email-link -> api:8000   (link in verification emails)
                 └─ other /v1, /docs, /redoc, /openapi.json  -> 404
Docker network "rationsmart_edge": nginx, frontend, api
Backend default network:           api, worker, beat, redis (password-protected, unpublished)
api/worker -> managed Postgres (TLS)      redis: bundled, or a managed one via EXTERNAL_REDIS_URL
```

Works on any Ubuntu 24.04 VM (Azure, AWS, GCP, ...): nothing in the compose files or scripts is cloud-specific.

## Prerequisites on the VM
- Docker Engine **with the Compose plugin >= 2.20**. Ubuntu's own `docker.io` package has no Compose plugin;
  install `docker-ce` + `docker-compose-plugin` from Docker's apt repo. The deploy user must be in the `docker` group.
- `curl` and `flock` (present on standard Ubuntu cloud images).
- Inbound TCP 80 open in the provider's firewall; the VM allowed to reach Postgres (firewall rule or private networking).
- Port 80 free on the host (stop any preinstalled Apache/nginx), or set `GATEWAY_PORT` (then include it in `API_BASE_URL`).
- ARM VMs: use `FORCE_BUILD=1` unless the registry images are multi-arch.

## First-time setup (on the VM)

1. Clone the repo to `~/rationsmart` and `cd` into it.
2. Create `backend/.env` from `backend/.env.example` and set at least:
   ```
   POSTGRES_HOST=<server>.postgres.database.azure.com
   POSTGRES_PORT=5432
   POSTGRES_USER=...  POSTGRES_PASSWORD=...  POSTGRES_DB=...
   PGSSLMODE=require              # managed Postgres needs TLS; psycopg2 (alembic, pg_dump) and asyncpg both read it
   REDIS_PASSWORD=<openssl rand -hex 24>   # bundled Redis; hex avoids URL-escaping problems
   #   ...or, for a managed Redis, set EXTERNAL_REDIS_URL=rediss://... instead (REDIS_PASSWORD not needed)
   JWT_SECRET_KEY=...  API_BASE_URL=http://<VM_PUBLIC_IP>
   ALLOWED_ORIGINS=http://<VM_PUBLIC_IP>
   SMTP_USERNAME=... SMTP_PASSWORD=... FROM_EMAIL=...
   ```
   **`REDIS_PASSWORD` must be URL-safe** (letters, digits, `-_.~`; `openssl rand -hex 24` is ideal): it is spliced
   unescaped into `redis://:PASSWORD@redis:6379/0`, so a password with `@ / ? # : %` makes the API's Redis login fail
   (`/health` then reports `cache: disconnected`).
   `chmod 600 backend/.env`. `API_BASE_URL` must be the public gateway URL: verification emails link to
   `{API_BASE_URL}/v1/auth/verify-email-link`.
3. **Quote values containing `$`.** Compose expands `$NAME` in `.env` values and replaces unknown names with an
   empty string, so `KEY=abc$XyZ` silently becomes `abc`. Write `KEY='abc$XyZ'` (single quotes) or `KEY=abc$$XyZ`.
   `deploy.sh` warns with the affected key names (never the values).
   **A `POSTGRES_PASSWORD` containing `@ / ? # : %` must be written percent-encoded** (`@` -> `%40`, ...): the app
   builds `postgresql://user:PASSWORD@host/db` without escaping it. `deploy.sh` decodes it for `pg_dump`. Or simply
   use a URL-safe password (letters, digits, `-_.~`).
4. The frontend needs no `.env`: `BACKEND_HOST` defaults to `api` on the shared network.
5. Optional: `docker login ghcr.io` if registry images are private. Without registry images the script builds locally.

## Deploy

```bash
./deploy.sh            # or: ./deploy.sh up
```

Phase 1 (`_prepare`, leaves the running stack untouched): preflight checks, `git pull --ff-only` (skipped with a
warning if the branch has no upstream), tag the running images `:rollback`, pull images (local build if the pull
fails), `pg_dump` to `backups/`. A failure here aborts with nothing changed.
Phase 2 (`_apply`): `alembic upgrade head`, start backend, frontend, gateway (waiting for healthchecks), reload
nginx, smoke-test through the gateway. A failure here rolls back to the previous images automatically.
Output is also appended to `deploy.log`.

Variants: `IMAGE_TAG=<git-sha> ./deploy.sh`, `FORCE_BUILD=1 ./deploy.sh`, `SKIP_GIT_PULL=1 ./deploy.sh`,
`SKIP_BACKUP=1 ./deploy.sh` (not recommended).

## Operate

| Task | Command |
| --- | --- |
| Status | `./deploy.sh status` |
| Logs | `./deploy.sh logs` or `./deploy.sh logs api` |
| Roll back to the previous images | `./deploy.sh rollback` |
| Stop everything | `./deploy.sh down` (volumes kept) |
| Restore a dump | `pg_restore --clean --no-owner -h <host> -U <user> -d <db> backups/<file>.dump` |
| Rotate the Redis password | edit `backend/.env`, then `./deploy.sh` |
| Change the nginx config | edit `gateway/nginx/conf.d/*.conf`, then `./deploy.sh` (it runs `nginx -t` + reload) |

## Things to know

- **Rollback reverts images only.** It does not revert database migrations (restore `backups/*.dump` if needed) and it
  does not revert `.env` changes. If a deploy failed because of a bad `.env`, fix the file first; rolling back
  with the bad file in place just fails again.
- **Rollback needs a previous run.** The `:rollback` images are created from the containers that were running when the
  deploy started, so the first deploy on a fresh VM has nothing to roll back to (the script says so and changes nothing).
- Without a domain/TLS the app is served over plain HTTP. The Next.js app sets the session cookie `Secure` only on
  HTTPS and sends HSTS, which browsers ignore on HTTP. Login works, but cookies are not `Secure` until TLS is added.
- Nginx overwrites `X-Forwarded-For` with the real client address, because the API trusts that header from any peer.
- `pg_dump` runs from the api image (`postgresql-client-15`). If the managed server runs a newer major version, bump
  the client in `backend/Dockerfile`, or the pre-deploy backup fails.
- `PGSSLMODE=require` encrypts but does not verify the server certificate. For verification use `verify-full` with
  `PGSSLROOTCERT` pointing at a mounted CA bundle.
- Only nginx publishes a port. Docker-published ports bypass UFW, so keep it that way.
- Image names default to `ghcr.io/ucdavis/rationsmart-{api,pwa}`; override with `IMAGE_REGISTRY`.
- Known, outside the deployment scope: the Next.js proxy drops `X-Forwarded-For`, so the API sees the frontend
  container's address for proxied requests; any per-IP rate limit in the API is shared by all users on that path.

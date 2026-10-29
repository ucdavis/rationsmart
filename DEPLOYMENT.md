# Deployment runbook (single Ubuntu VM + Azure Database for PostgreSQL)

```
Internet :80 -> nginx (gateway/)            only published port
                 ├─ /                       -> frontend:3000   (Next.js, proxies /api/proxy/* to the API)
                 ├─ = /v1/auth/verify-email-link -> api:8000   (link in verification emails)
                 └─ other /v1, /docs, /redoc, /openapi.json  -> 404
Docker network "rationsmart_edge": nginx, frontend, api
Backend default network:           api, worker, beat, redis (password-protected, unpublished)
api/worker -> Azure Postgres Flexible Server (TLS)
```

## First-time setup (on the VM)

1. Clone the repo to `~/rationsmart` and `cd` into it.
2. Create `backend/.env` from `backend/.env.example` and set at least:
   ```
   POSTGRES_HOST=<server>.postgres.database.azure.com
   POSTGRES_PORT=5432
   POSTGRES_USER=...  POSTGRES_PASSWORD=...  POSTGRES_DB=...
   PGSSLMODE=require              # Azure requires TLS; psycopg2 (alembic, pg_dump) and asyncpg both read it
   REDIS_PASSWORD=<openssl rand -hex 24>   # hex: no characters that need URL-escaping
   JWT_SECRET_KEY=...  API_BASE_URL=http://<VM_PUBLIC_IP>
   ALLOWED_ORIGINS=http://<VM_PUBLIC_IP>
   SMTP_USERNAME=... SMTP_PASSWORD=... FROM_EMAIL=...
   ```
   `chmod 600 backend/.env`. `API_BASE_URL` must be the public gateway URL: verification emails link to `{API_BASE_URL}/v1/auth/verify-email-link`.
3. Frontend needs no `.env` for deployment: `BACKEND_HOST` defaults to `api` on the shared network.
4. Allow the VM to reach Postgres: add the VM's outbound IP to the server's firewall rules, or use VNet integration / a private endpoint. Open inbound TCP 80 on the VM's network security group.
5. Optional: `docker login ghcr.io` if the registry images are private. Without registry images the script builds locally.

## Deploy

```bash
./deploy.sh            # or: ./deploy.sh up
```

What it does: preflight checks, `git pull --ff-only`, tags current images `:rollback`, pulls images (falls back to a local build if the pull fails), `pg_dump` to `backups/`, `alembic upgrade head`, starts backend, frontend, gateway (waiting for healthchecks), then smoke-tests through port 80. If anything fails it rolls back to the previous images automatically. Output is also appended to `deploy.log`.

Useful variants: `IMAGE_TAG=<git-sha> ./deploy.sh`, `FORCE_BUILD=1 ./deploy.sh`, `SKIP_GIT_PULL=1 ./deploy.sh`.

## Operate

| Task | Command |
| --- | --- |
| Status | `./deploy.sh status` |
| Logs | `./deploy.sh logs` or `./deploy.sh logs api` |
| Roll back to the previous images | `./deploy.sh rollback` (migrations are **not** reverted) |
| Stop everything | `./deploy.sh down` (volumes kept) |
| Restore a dump | `pg_restore --clean --no-owner -h <host> -U <user> -d <db> backups/<file>.dump` |
| Rotate Redis password | edit `backend/.env`, then `./deploy.sh` (Redis restarts with the new value) |

## Things to know

- Without a domain/TLS the app is served over plain HTTP. The Next.js app sets the session cookie `Secure` only on HTTPS, and sends HSTS; browsers will ignore HSTS on HTTP, so login works but cookies are not `Secure` until TLS is added.
- `pg_dump` runs from the api image (`postgresql-client-15`). If the Azure server runs a newer major version, bump the client in `backend/Dockerfile`, or the pre-deploy backup fails.
- `PGSSLMODE=require` encrypts but does not verify the server certificate. For verification use `verify-full` with `PGSSLROOTCERT` pointing at a mounted CA bundle.
- Only nginx publishes a port. Docker-published ports bypass UFW, so keep it that way.
- Image names default to `ghcr.io/ucdavis/rationsmart-{api,pwa}`; override with `IMAGE_REGISTRY`.

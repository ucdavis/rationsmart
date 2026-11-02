# RationSmart configuration

How to set up the server is in **[DEPLOYMENT.md](DEPLOYMENT.md)**. This page explains every setting you can change.

**How configuration works:** you edit **one file**, `backend/.env`. After any change, run `./deploy.sh` again: it applies the change
and restarts what is needed. The frontend needs no configuration.

Contents: [Required settings](#required-settings) ·
[Optional settings](#optional-settings) · [Redis](#redis) · [Changing the port](#changing-the-port) · [Deploy options](#deploy-options) ·
[Loading data](#loading-data) · [Registry images](#registry-images) · [Frontend options](#frontend-options)

## Required settings

These must be in `backend/.env`. `backend/env.template` already contains all of them.

| Setting | Example | What it is |
| --- | --- | --- |
| `POSTGRES_HOST` | `myserver.postgres.database.azure.com` | the database server's name |
| `POSTGRES_PORT` | `5432` | the database port. **Always set it**: if it is missing the app uses 9900, which is almost never right |
| `POSTGRES_USER` | `rs_app` | the database user |
| `POSTGRES_PASSWORD` | `a1b2c3...` | that user's password |
| `POSTGRES_DB` | `rationsmart` | the database name |
| `PGSSLMODE` | `require` | encrypt the database connection. Managed PostgreSQL requires it |
| `REDIS_PASSWORD` | `9f8e7d...` | password for the Redis that runs inside the stack (not needed with a [managed Redis](#redis)) |
| `JWT_SECRET_KEY` | `4c5d6e...` | secret that signs login tokens. Changing it signs everyone out |
| `API_BASE_URL` | `http://127.0.0.1` (placeholder) | the public address of the app: `http://` plus your server's public IP or DNS name. Verification emails link to it, so `127.0.0.1` (this machine only) must be replaced |
| `ALLOWED_ORIGINS` | `http://127.0.0.1` (placeholder) | the same address (more than one: separate with commas) |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | | the email account that sends mail |
| `FROM_EMAIL` | `noreply@example.org` | the sender address users see |

**Passwords:** use only letters and digits (generate them with `openssl rand -hex 16`), because characters such as `@ / ? # : %` break the
connection addresses they are placed in; if you must keep a special character, write `POSTGRES_PASSWORD` percent-encoded (`@` as `%40`),
use letters and digits for `REDIS_PASSWORD` (it has no workaround), and wrap any value that contains a `$` in single quotes (`KEY='abc$def'`),
or Docker Compose silently drops what follows the `$` (`deploy.sh` warns you with the setting's name).

## Optional settings

Add these to `backend/.env` only if you need to change the default.

| Setting | Default | What it does |
| --- | --- | --- |
| `SMTP_SERVER`, `SMTP_PORT` | `smtp.gmail.com`, `587` | your email server |
| `FROM_NAME` | `RationSmart Feed Formulation` | sender name in emails |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days) | how long a login lasts |
| `JWT_ALGORITHM` | `HS256` | token algorithm (leave it) |
| `WORKERS` | `3` | number of API processes. Raise on bigger servers |
| `OPTIMIZATION_POOL_WORKERS` | number of CPUs minus 1 | processes each API process uses for diet optimisation. **Lower it on small servers** to save memory |
| `FORCE_PIN_RESET_FOR_LEGACY_USERS` | `true` | make users with an old 4-digit PIN choose a new 6-digit PIN |
| `ALLOW_INFEASIBLE_REPORTS` | `false` | allow reports for diets that cannot meet the requirements |
| `ALLOW_FEED_LIBRARY_WIPE` | `false` | turns on an admin call that deletes the whole feed library. **Keep it off in production** |
| `NSGA3_VERBOSE` | `false` | extra optimiser logging |
| `BACKUP_DIR` | `/backups` | where the app writes its own backups |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` | empty | old S3 storage for reports (only if you use it) |
| `PGSSLROOTCERT` | | with `PGSSLMODE=verify-full`: path to the CA certificate to check the database server against |

A `REDIS_URL` line in `.env` is ignored on purpose (the stack sets it itself).

## Redis

**Default (nothing to do):** Redis runs inside the stack, protected by `REDIS_PASSWORD`, and is not reachable from outside.

**Use your own managed Redis instead:** remove `REDIS_PASSWORD` and add

```
EXTERNAL_REDIS_URL=rediss://:<password>@<your-redis-host>:6380/0
```

(`rediss://` with two `s` means encrypted). The bundled Redis container then stays idle.

## Changing the port

By default the app is on port **80**. To use another port, for example 8080:

1. In `backend/.env` set the address with the port: `API_BASE_URL=http://<server address>:8080` and `ALLOWED_ORIGINS=http://<server address>:8080`
   (for a test on the server itself: `http://127.0.0.1:8080`).
2. Open that port in your cloud firewall.
3. Deploy with the port set: `GATEWAY_PORT=8080 ./deploy.sh`. Use the same prefix for later runs that start the stack
   (`GATEWAY_PORT=8080 ./deploy.sh rollback`, and so on), or the gateway returns to port 80.

## Deploy options

Put these **before** the command: `FORCE_BUILD=1 ./deploy.sh`.

| Option | What it does |
| --- | --- |
| `GATEWAY_PORT=80` | the port the app listens on |
| `EXPECT_DB=rationsmart` | stop unless `backend/.env` points at a database with this name. Handy to avoid touching the wrong database |
| `FORCE_BUILD=1` | build the images on the server instead of downloading them. Use it on ARM servers |
| `SKIP_GIT_PULL=1` | do not run `git pull` first (it is skipped automatically when the branch has nothing to pull from) |
| `SKIP_BACKUP=1` | do not back up the database first. Not recommended |
| `IMAGE_TAG`, `IMAGE_REGISTRY` | choose which downloadable images to use (in `backend/.env` or on the command line), see [Registry images](#registry-images) |

All commands: `./deploy.sh` (deploy), `rollback`, `status`, `logs [service]`, `down`, `seed`, `create-admin`.

## Loading data

A new database is empty. `./deploy.sh seed` loads the reference data (countries, languages, feed types and categories, vocabulary,
feeds and their translations) from the newest folder in `data/packs/master/`.

```bash
./deploy.sh seed --dry-run                 # show what would change; writes nothing
./deploy.sh seed                           # load it (takes a backup first)
./deploy.sh seed --mode update             # also refresh values of rows that already exist (see below)
./deploy.sh seed --pack /packs/master/<version>   # use a specific version
```

- **Safe to repeat.** The normal mode only **adds what is missing**. It never deletes anything and never changes a row that is already
  there (one exception: on a brand-new database it switches on the languages the pack ships as active).
- **`--mode update`** overwrites the pack's own columns (names, nutrient values, translations) on rows that already exist, so older
  values are replaced. It never deactivates or deletes anything. Run it with `--dry-run` first and read the report.
- Rows that cannot be loaded (for example a feed name already used under another code) are listed as `skipped`; the rest still loads.
- It is all-or-nothing: if there is an error, nothing is loaded. It refuses to run if the database version does not match the pack,
  if a pack file was changed, or while the CLIMDES feed sync is running (wait, then retry).
- Afterwards it clears the app's cached feed and language lists so the new data shows immediately.

**First administrator:**

```bash
./deploy.sh create-admin --email you@example.org --name "Your Name" --country-code ETH
```

It asks for a 6-digit PIN twice. Options: `--pin-stdin` (read the PIN from standard input instead of asking), `--promote` (make an
existing account an admin, keeping its PIN) and `--force` (allow another admin when one already exists). The pack ships five countries
that are active for sign-up: `ETH`, `IDN`, `PHL`, `THA`, `VNM`.

**What the data pack does not contain** (set up separately): users (people register in the app) and the **CLIMDES sync settings**.
To set CLIMDES, sign in as the admin and call the admin API through the app (the gateway does not expose `/v1/*` directly), for example
`/api/proxy/v1/admin/feed-sync/config`:

- `PUT /v1/admin/feed-sync/config` with any of: `endpoint_url`, `auth_type` (`none`, `api_key` or `bearer`), `auth_header_name`,
  `auth_token`, `sync_day_of_week`
- `PUT /v1/admin/feed-sync/scheduler/toggle` with `{"action": "enable"}` to turn the schedule on
- `POST /v1/admin/feed-sync/run` to run a sync now

## Registry images

By default `./deploy.sh` tries to download ready-made images from `ghcr.io/your-org` (a placeholder name) and, because nothing is
published there, **builds them on the server**. You normally do not need to do anything. If you publish your own images, set these
two lines in `backend/.env` (they are already in the template):

```
IMAGE_REGISTRY=ghcr.io/<your organisation>
IMAGE_TAG=latest
```

A value given on the command line wins, for example `IMAGE_REGISTRY=ghcr.io/acme ./deploy.sh`. For private images run
`docker login ghcr.io` first. The images are named `rationsmart-api` and `rationsmart-pwa`.

## Frontend options

The web app needs no configuration: inside the stack it always talks to the API at `http://api:8000`. Two optional settings go in
`frontend/.env` (create it if you need it): `DISABLE_PWA=true` (build without the offline mode; needs a rebuild with `./deploy.sh`) and
`BACKEND_ENV` (a label such as `prod`, sent to the API in an `x-backend-env` header; default `custom`).

## About https

The setup serves the app over plain `http`. For `https`, put the server behind your cloud provider's load balancer (or add
certificates to the gateway). Until then, the session cookie is not marked `Secure`; sign-in still works.

# RationSmart troubleshooting

Find your message or symptom below. Setup is in **[DEPLOYMENT.md](DEPLOYMENT.md)**, settings in **[CONFIGURATION.md](CONFIGURATION.md)**.

**First, look at the logs.** Most problems explain themselves there:

```bash
./deploy.sh status          # which parts are running?
./deploy.sh logs api        # the API's messages (or: frontend, nginx, worker, redis)
tail -n 60 deploy.log       # what the last deploy did
```

## During deploy

### "docker compose ... too old" or `docker compose` does not exist
Docker was installed from Ubuntu's own package, which has no Compose plugin. Install Docker as in Step 1 of DEPLOYMENT.md
(`docker-ce` and `docker-compose-plugin`), then `docker compose version` must show 2.20 or higher.

### "backend/.env: SOMETHING is not set"
A required line is missing or empty in `backend/.env`. Add it (see [Required settings](CONFIGURATION.md#required-settings)) and run `./deploy.sh` again.

### Warnings: "backend/.env is readable by others" / "Azure Postgres requires TLS"
Harmless, but fix them: `chmod 600 backend/.env`, and add the line `PGSSLMODE=require`.

### Warning: "value(s) of X contain $NAME"
A `$` in a value is being dropped by Docker Compose. Wrap that value in single quotes: `X='the$value'`.
See the **Passwords** note under [Required settings](CONFIGURATION.md#required-settings).

### "password authentication failed"
The database login is wrong. Check `POSTGRES_USER` and `POSTGRES_PASSWORD`. If the password contains special characters, use a
letters-and-digits password (or percent-encode it). Test the login by hand with `psql` from any machine that can reach the database.

### "Connection refused" or an odd host name such as `@server/...`
A special character in `POSTGRES_PASSWORD` (such as `@`, `/`, `#`) broke the connection address. Use a letters-and-digits password.

### "No route to host", "timeout" or "could not connect to server"
The server cannot reach the database. Allow the server's IP address in the database firewall (Step 2c) and check `POSTGRES_HOST`/`POSTGRES_PORT`.

### Backup fails with a version mismatch
The error mentions `server version` and `pg_dump version`. Your PostgreSQL is newer than the backup tool inside the app image (version 15).
Open `backend/Dockerfile`, change the line that installs `postgresql-client-15` to your server's major version (for example `-16`), and
run `./deploy.sh` again. (The apt source in that file offers newer versions.)

### "Bind for 0.0.0.0:80 failed: port is already allocated" (port 80 in use)
Another program uses port 80 (often Apache or nginx installed on the server). Stop it (`sudo systemctl disable --now apache2`), or use
another port: see [Changing the port](CONFIGURATION.md#changing-the-port).

### "another deploy is already running"
Only one deploy runs at a time. Wait for the other to finish (`pgrep -af deploy.sh` shows it). If nothing is running, the message
disappears on its own once the earlier command has exited.

### "git pull failed"
You have local changes or the branch has diverged. Either fix that, or deploy the code as it is: `SKIP_GIT_PULL=1 ./deploy.sh`.

### The build runs out of disk space
`docker system df` shows how much Docker uses. Free space by deleting old files in `backups/` (after copying them somewhere safe)
and old images you no longer need. Check with `df -h` before deploying again.

### "deploy FAILED" and then "rollback failed"
The rollback only restores the previous program version. If the cause is a broken `backend/.env`, fix the file first, then run
`./deploy.sh` again.

### "no :rollback image for every app service"
There is nothing to go back to (for example, this was the first deploy). Fix the cause shown above it and deploy again.

## After deploy

### The page opens but actions fail with an error 502
The web app cannot reach the API. Run `./deploy.sh status` and `./deploy.sh logs api`. The API must be `healthy`.

### `/health` shows `"cache": "disconnected"`
The Redis password has a special character. Set `REDIS_PASSWORD` to letters and digits (`openssl rand -hex 24`) and run `./deploy.sh`.

### `/health` shows `"database": "disconnected"`
Database login or network problem, see the database entries above. `./deploy.sh logs api` shows the exact error.

### There is no country to choose, or I cannot sign in
The reference data is not loaded yet: run `./deploy.sh seed` and then `./deploy.sh create-admin` (Step 6). Only five countries are active
for sign-up (`ETH`, `IDN`, `PHL`, `THA`, `VNM`).

### The verification email never arrives, or its link goes to the wrong place
- Wrong place: `API_BASE_URL` must be your public address, with the port if it is not 80. Fix it and run `./deploy.sh`.
- Not sent: check the `SMTP_*` settings. Gmail needs an *app password*. `./deploy.sh logs api` shows mail errors.

### `seed` says "schema revision ... but pack ... supports ..."
The database structure is not at the version the data pack expects. Run `./deploy.sh` first (it updates the structure), then `seed`.

### `seed` says the CLIMDES feed sync is running
The sync is busy. Wait a few minutes and try again.

### `seed` or `create-admin` says it cannot find a country
Load the data first (`./deploy.sh seed`), and use a 3-letter code that exists, for example `ETH`.

## Going back and restoring

- **Previous program version:** `./deploy.sh rollback`. This does not undo database changes or `.env` edits.
- **Restore the database from a backup** (the file names are in `backups/`, newest last):

  ```bash
  pg_restore --clean --no-owner -h <database server> -U rs_app -d rationsmart backups/<file>.dump
  ```

  This **replaces** the current contents with the backup, so use it deliberately.
- **Stop everything without losing data:** `./deploy.sh down`. Start again with `./deploy.sh`.

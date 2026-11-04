# RationSmart: deploy it on one server

This guide takes you from an empty Ubuntu server to a running RationSmart, one step at a time.
Allow about **30 minutes** (most of it is the first build).

```
  people ──> nginx (port 80) ──> web app ──> API ──> your PostgreSQL database
                                              └── background workers + Redis
```

Everything runs in Docker on **one Ubuntu 24.04 server**. Only port 80 is open to the world.
Two other pages cover the details: **[CONFIGURATION.md](CONFIGURATION.md)** (every setting) and
**[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** (when something goes wrong).

## Before you start: collect these

| You need | Where to get it | Used in |
| --- | --- | --- |
| An Ubuntu 24.04 server (2+ CPUs, 4+ GB memory, 20+ GB disk) and SSH access | your cloud provider | Step 1 |
| A PostgreSQL database server (version 15 or older) | your cloud provider ("managed PostgreSQL") | Step 2 |
| The server's **public IP address** (or DNS name) | your cloud provider's VM page | Step 4 |
| An email account that can send mail (Gmail with an app password works) | your mail provider | Step 4 |
| The git address of this repository | your team | Step 3 |

---

## Step 1: Prepare the server

**1a. Open port 80.** In your cloud provider's firewall for the server (Azure "Network security group", AWS "Security group",
GCP "Firewall rule") allow **inbound TCP 80** from anywhere. Keep SSH (port 22) limited to your own IP address.

**1b. Log in** to the server with SSH.

**1c. Install Docker.** Copy and paste this whole block:

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

**1d. Log out and log in again** (so your user may run Docker), then check:

```bash
docker compose version
```

You should see `Docker Compose version v2.20` or higher. ✅

> Port 80 must be free on the server. If something else already uses it (for example Apache), stop that first, or pick another
> port later (see [CONFIGURATION.md](CONFIGURATION.md#changing-the-port)).

---

## Step 2: Prepare the database

**2a. Make a password** for the app's database user and write it down. Run this on the server and copy the output:

```bash
openssl rand -hex 16
```

**2b. Create the user and the empty database.** Connect to your PostgreSQL as its admin user (the provider's console or `psql`)
and run (replace the password with the one from 2a):

```sql
CREATE USER rs_app WITH PASSWORD 'PASTE_THE_PASSWORD_HERE';
CREATE DATABASE rationsmart OWNER rs_app;
```

**2c. Let the server connect.** In the database's firewall (or private network settings) allow the **server's IP address**.

Write down: the **database server name** (for example `myserver.postgres.database.azure.com`), the **user** (`rs_app`),
the **password** and the **database name** (`rationsmart`). You need them in Step 4. ✅

> If your PostgreSQL is version 16 or newer, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#backup-fails-with-a-version-mismatch) first.

---

## Step 3: Download the code

```bash
git clone <the repository address> ~/rationsmart
cd ~/rationsmart
```

All later commands are run from this folder (`~/rationsmart`).

---

## Step 4: Configure

**4a. Create your settings file** from the ready-made template:

```bash
cp backend/env.template backend/.env
chmod 600 backend/.env
```

**4b. Generate the two secrets automatically** (copy and paste both lines):

```bash
sed -i "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=$(openssl rand -hex 24)/" backend/.env
sed -i "s/^JWT_SECRET_KEY=.*/JWT_SECRET_KEY=$(openssl rand -hex 32)/" backend/.env
```

**4c. Fill in the rest** with a text editor:

```bash
nano backend/.env
```

Replace the placeholders (`CHANGE_ME...` and the placeholder address `127.0.0.1`). Here is what to put on each:

| Setting | What to put |
| --- | --- |
| `POSTGRES_HOST` | the database server name from Step 2 |
| `POSTGRES_USER`, `POSTGRES_DB` | `rs_app` and `rationsmart`: already set, change only if you used other names in Step 2 |
| `POSTGRES_PASSWORD` | the password from Step 2a |
| `API_BASE_URL` and `ALLOWED_ORIGINS` | `http://` followed by your **server's public IP or DNS name** (both lines the same, no trailing `/`). The template has `http://127.0.0.1` as a placeholder: that address means "this machine only", so it must be replaced for other people to use the app |
| `SMTP_USERNAME`, `SMTP_PASSWORD`, `FROM_EMAIL` | your email account, its password, and the sender address users will see |

Save and exit (in nano: `Ctrl+O`, `Enter`, `Ctrl+X`).

**4d. Check the file** has no leftover placeholders. This command must print nothing:

```bash
grep -v '^#' backend/.env | grep -n "CHANGE_ME\|127.0.0.1"
```

If it prints lines, those values still need to be changed. ✅

---

## Step 5: Deploy

```bash
./deploy.sh
```

The first run builds the app and takes **5 to 10 minutes**. It prints its progress, and a successful run ends with:

```
[deploy] smoke test passed
[deploy] deploy OK
[deploy] NOTE: the database has no data yet (a deploy only creates the structure).
[deploy] NOTE: next, load the reference data:  ./deploy.sh seed --dry-run   then   ./deploy.sh seed
```

**A deploy only creates the empty structure. It does not load any data**: the tables stay empty until you do Step 6. (The `NOTE`
lines appear while the database is still empty.) It also saves a backup of the database in `backups/` before changing anything. If anything fails it tells you why, and your
existing setup is left as it was (see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)).

**Check that everything is running:**

```bash
./deploy.sh status
```

Every line should say `Up` (and `healthy` where shown) for: `api`, `worker`, `beat`, `redis`, `frontend` and `nginx`. ✅

---

## Step 6: Add the data and the first admin

A new database is empty: it has no countries, feeds or users. Load the reference data that ships with this repository:

```bash
./deploy.sh seed --dry-run
```

This only **shows** what would be added and changes nothing. You should see a table like this:

```
DRY RUN (rolled back): pack 2026.11.01, mode insert-missing
table                      in pack  inserted  updated  skipped
country                        194       194        0        0
feeds                          235       235        0        0
...
```

Now load it for real (it backs up first):

```bash
./deploy.sh seed
```

Then create the first administrator (pick a 3-letter country code from `ETH`, `IDN`, `PHL`, `THA`, `VNM`):

```bash
./deploy.sh create-admin --email you@example.org --name "Your Name" --country-code ETH
```

It asks for a **6-digit PIN** twice, and prints `super admin you@example.org created`. ✅

> Loading is safe to repeat: it only adds what is missing and never deletes anything.
> More about it in [CONFIGURATION.md](CONFIGURATION.md#loading-data).

---

## Step 7: Check that it works

Run these on the server. The answers shown are what you should get:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/       # 200  (the web app)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/docs   # 404  (the API docs are private)
cd backend && docker compose exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"; cd ..
```

The last command should print:

```
{"status":"healthy","database":"connected","cache":"connected","version":"4.0.0"}
```

Finally, open `http://<your server's IP>/` in a browser and **sign in** with the admin email and PIN from Step 6. 🎉

---

## Day-to-day commands

Run these in `~/rationsmart`.

| I want to... | Command |
| --- | --- |
| see if everything is running | `./deploy.sh status` |
| read the logs | `./deploy.sh logs` (all) or `./deploy.sh logs api` |
| install a new version | `git pull` then `./deploy.sh` |
| go back to the previous version | `./deploy.sh rollback` |
| change a setting | edit `backend/.env`, then `./deploy.sh` |
| stop everything (data is kept) | `./deploy.sh down` |
| restore a database backup | `pg_restore --clean --no-owner -h <host> -U rs_app -d rationsmart backups/<file>.dump` |

Backups are written to `backups/` on the server. Copy them somewhere safe now and then, and delete old ones.

## Good to know

- **Web address:** the app is served over plain `http`. For `https`, put the server behind your cloud provider's load balancer or add
  certificates later; the app works without it.
- **Rolling back** returns to the previous program version only. It does not undo database changes or `.env` edits; use a backup for that.

## More

- **[CONFIGURATION.md](CONFIGURATION.md)**: every setting, the password rules, other ports, using a managed Redis, loading data options.
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**: error messages and how to fix them.
- **[INFRASTRUCTURE.md](INFRASTRUCTURE.md)**: on Azure, create the server, database and registry from templates and release from GitHub Actions.
- **[data/packs/README.md](data/packs/README.md)**: how the reference-data packs are made (for maintainers).

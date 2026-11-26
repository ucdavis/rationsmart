# RationSmart on Azure: create the environment and release with GitHub Actions

This guide builds the whole Azure environment from templates (Bicep), and releases new versions from GitHub with no stored
Azure password (OIDC sign-in). The release itself is still done by [`deploy.sh`](deploy.sh) on the server, exactly as in
**[DEPLOYMENT.md](DEPLOYMENT.md)**. Use DEPLOYMENT.md instead if you deploy by hand on a server you set up yourself.

```
  Run workflow ──> GitHub Actions ──(OIDC, no password)──> Azure
                        │                                    ├─ VM  ── runs deploy.sh ──> PostgreSQL Flexible Server
                        └─ run-command on the VM ───────────┘   └─ reads its secrets from Key Vault
```

What gets created in one resource group: a virtual network (a subnet for the VM, a subnet for the database) and firewall,
**one Ubuntu 24.04 VM** with a 100 GB disk, a **PostgreSQL Flexible Server** with the app database reachable only from inside the
virtual network (private access, as the UCD policy requires), a **Key Vault**, and the permissions between them. There is no
container registry: the VM builds the images itself, from the commit being released.

## Workflows at a glance

Six workflows work on the environment. All are started by hand (**Actions**, **Run workflow**); none has a push or pull-request
trigger. They share one concurrency group, `stage`, so a bootstrap, an infrastructure change, a release and a data load never run at
the same time: they queue, and GitHub keeps only one waiting run per group (a newer waiting run replaces the older one).
None of them uses `azure/login`: this repository only allows GitHub-owned actions, so each signs in with the Azure CLI and the job's OIDC token.

| Workflow (file) | Inputs | Signs in as | GitHub environment (approval) | What it does |
|---|---|---|---|---|
| **Bootstrap** (`bootstrap.yml`) | `mode`: `bootstrap`, `register-providers`, `preflight`; `resource_group`, `location` | the **Owner** identity (repository-level `AZURE_*` variables) | none: **no approval**, trusted by branch (`main`, `test/azure-pipeline`) | creates the resource group and the two pipeline identities; registers resource providers; or reads quota, sizes and policies (read-only). See [infra/bootstrap/README.md](infra/bootstrap/README.md) |
| **Infrastructure** (`infra.yml`) | `mode`: `whatif` (default) or `apply` | `infra` | `stage-infra` (approval, both modes) | lints and compiles the templates (no Azure access), then runs a what-if, and with `apply` deploys `infra/main.bicep` incrementally |
| **Infrastructure (SMTP secret)** (`infra-smtp-secret.yml`) | `mode`: `whatif` or `apply`; `key_vault_name` (required) | `infra` | `stage-infra` (approval) | writes only the `smtp-password` secret of the vault. See [below](#changing-only-the-email-password-the-smtp-secret-workflow) |
| **Infrastructure (storage)** (`infra-storage.yml`) | `mode`: `whatif` or `apply`; `vm_name` (required) | `infra` | `stage-infra` (approval) | creates only the report PDF storage account, its `reports` container and the VM's write access to it. See [below](#report-pdf-storage-the-storage-workflow) |
| **Deploy** (`deploy.yml`) | `action`: `up`, `app-release`, `rollback`, `diagnose`, `seed-dry-run`, `seed`, `create-admin`; `target`; `confirm`; `admin_country_code` | `app` | `stage` (approval) | runs a script on the VM through an Azure run-command. Only from `main` (forks excepted) |
| **Data** (`data.yml`) | `action`: `seed-dry-run`, `seed`, `create-admin`; `confirm`; `admin_country_code` | `app` | `stage` (approval) | loads the data pack or creates the first admin on the VM. Only from `main` (forks excepted) |

Deploy `target` (`both`, `frontend`, `backend`) applies to `app-release` and `rollback`: `app-release` needs `frontend` or `backend`
(use `up` for both), and the run is refused otherwise. `create-admin` needs `CREATE-ADMIN` typed in `confirm`.

Every step passes values to scripts through environment variables, never by pasting event data (titles, branch names, commit
messages) into a command. Pull requests never reach a job that signs in to Azure.

## Before you start

| You need | Notes |
|---|---|
| An **empty resource group** | for example `rg-rationsmart-stage` |
| **Owner** on that group (or Contributor plus User Access Administrator) | needed once, to create the pipeline identities and their roles. The resource providers Compute, Network, DBforPostgreSQL, KeyVault, ManagedIdentity and Storage must be registered on the subscription (the **Bootstrap** workflow, mode `register-providers`, does it) |
| **Admin** on the GitHub repository | to create environments, variables and secrets |
| Azure CLI (`az`) and optionally the GitHub CLI (`gh`) | on your computer |
| An email account that can send mail | the app's verification emails |
| An SSH key pair | `ssh-keygen -t ed25519`; only the public key is used |

Check the VM size exists in your region and quota: `az vm list-skus --location <region> --size Standard_D4as_v6 -o table`.

## Step 1: Choose the settings

Copy `infra/params/example.bicepparam` to `infra/params/<env>.bicepparam` and change the names and sizes (the stage environment
already has `infra/params/stage.bicepparam`). It holds no secrets. The main settings:

| Setting | Meaning | Default |
|---|---|---|
| `namePrefix`, `databaseName` | resource names and the database | `rationsmart-stage`, `rationsmart_stage` |
| `location` | region of every resource | the resource group's region. `stage` sets `eastus2` (the group is in `eastus`, where PostgreSQL Flexible Server is not available to this subscription) |
| `vmSize`, `zone` | the VM | module default `Standard_D4as_v6`, zone 1. `stage` uses zone 2 (zone 1 is restricted in this subscription) |
| `postgresSkuName`, `postgresSkuTier`, `postgresStorageGb`, `postgresVersion` | the database server | module default Burstable `Standard_B2s`, 64 GB, version 15. `stage` uses GeneralPurpose `Standard_D2ds_v5`: Burstable fails with `SkuNotAvailable` in this subscription |
| `sshAllowedCidrs` (or `sshAllowedCidr`) | address ranges allowed to reach SSH (port 22). The list wins when it is not empty | empty: port 22 is closed, so a direct SSH connection fails. Entra ID is only the sign-in method once you can reach the VM; it does not open the port. To connect, add your address to this list, or use an Azure run-command (see below). `stage` allows two developer addresses |
| `httpAllowedCidrs`, `httpsAllowedCidrs` | source ranges for ports 80 and 443. An empty HTTPS list leaves 443 closed | module default: HTTP from anywhere, HTTPS closed. `stage` allows only the Cloudflare IPv4 ranges on both |
| `repoUrl` | what the VM clones on first boot (its default branch; each release then checks out its own commit). The Infrastructure workflow sets `REPO_URL` to the repository it runs in | this repository |

Names that must be unique across Azure (the vault and database server) get a suffix made from the resource group, so
two environments never clash.

## Step 2: Create the pipeline identities (once, by an Owner)

Follow **[infra/bootstrap/README.md](infra/bootstrap/README.md)**. It creates two identities that GitHub signs in as, bound to this
repository and to one GitHub environment each, so a run from a fork or an unapproved environment gets no access:

| Identity | GitHub environment | Can |
|---|---|---|
| `infra` | `stage-infra` | change resources in the group, and hand out only the roles the templates assign (Key Vault secret read, blob write on the report storage account, run-command on a VM) |
| `app` | `stage` | run commands on the one VM (nothing else; it cannot even read the resource group). There is no registry, so nothing is pushed |

## Step 3: Set up GitHub

In the repository, Settings, Environments: create **`stage-infra`** and **`stage`**. On both, add **required reviewers**, turn on
**prevent self-review**, and set **deployment branches** to `main` only. The reviewers on `stage-infra` are not optional: they
are the only gate before a run changes Azure. Every workflow (see [Workflows at a glance](#workflows-at-a-glance)) runs **only when
you start it by hand** (Actions, Run workflow); none has a push or pull-request trigger. To add one later, edit its `on:` block in
a pull request to `main`, and make sure the reviewers are set first. Then add the variables and secrets below, and read the two notes after them.

**Environment `stage-infra`** (used by the Infrastructure, Infrastructure (SMTP secret) and Infrastructure (storage) workflows)

| Name | Kind | Value |
|---|---|---|
| `AZURE_CLIENT_ID` | variable | the `infra` client ID from step 2 |
| `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `RESOURCE_GROUP` | variable | your tenant, subscription and group |
| `ADMIN_SSH_PUBLIC_KEY` | variable | contents of your `.pub` file |
| `APP_IDENTITY_PRINCIPAL_ID`, `RUN_COMMAND_ROLE_ID` | variable | outputs of step 2 |
| `POSTGRES_ADMIN_PASSWORD`, `JWT_SECRET_KEY`, `REDIS_PASSWORD`, `SMTP_PASSWORD` | **secret** | see below |

Make the three generated secrets with `openssl rand -hex 24` (hex needs no escaping in a database URL, and Redis requires it).
`SMTP_PASSWORD` is your email account's password and must not contain a single quote (`'`).

The secrets are used once, as inputs to the infrastructure run; they are stored in Key Vault, and the VM reads them there
(the whole path is under [Secrets: where they live and how they move](#secrets-where-they-live-and-how-they-move)).

> **Testing from a branch or fork:** run the workflow by hand (**Run workflow**) and, in the fork only, let the environments
> deploy from `main` plus `test/*`. A fork also needs its own bootstrap run with `githubRepo=<fork owner>/<fork name>`.
> In this repository itself, **Deploy** and **Data** run only from `main`: their first step stops a run started from any
> other branch, before it signs in to Azure. Forks are exempt (they deploy to their own Azure).
>
> **No personal Azure login:** if someone else gives you a managed identity with Owner on the subscription (trusted for
> branches such as `main` or `test/azure-pipeline`), skip the `az` commands in step 2. Put that identity's IDs in
> repository-level variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID`, and run the **Bootstrap**
> workflow from a trusted branch with a resource group name (the job has no environment). Then set the `stage-infra` and
> `stage` variables from the run summary and delete the repository-level ones. The `Infrastructure` and `Deploy`
> workflows still need those environments to allow the branch you run from.

## Step 4: Create the environment

Create it either way:

- **With the Infrastructure workflow (preferred, no personal Azure login):** once the `stage-infra` variables and secrets of step 3 are set,
  run **Infrastructure** (from a branch the `stage-infra` environment allows) with mode `whatif`, read the summary, then run it again with mode `apply`. Both runs need the
  `stage-infra` approval. The deployment is named `main`.
- **From your computer:** the parameter file reads its secrets and identity values from environment variables, so set them in your shell
  first (the values are the ones from steps 2 and 3, and are not stored anywhere):

```bash
export ADMIN_SSH_PUBLIC_KEY="$(cat ~/.ssh/id_ed25519.pub)"
export APP_IDENTITY_PRINCIPAL_ID=<appPrincipalId from step 2>
export RUN_COMMAND_ROLE_ID=<runCommandRoleId from step 2>
export POSTGRES_ADMIN_PASSWORD=<hex secret> JWT_SECRET_KEY=<hex secret> REDIS_PASSWORD=<hex secret> SMTP_PASSWORD=<mail password>
```

Then:

```bash
az deployment group what-if -g <resource-group> --template-file infra/main.bicep --parameters infra/params/stage.bicepparam
az deployment group create  -g <resource-group> --template-file infra/main.bicep --parameters infra/params/stage.bicepparam --mode Incremental
```

Read the what-if first: it should list the VM, database server, private DNS zone, vault, network and roles, all as **Create**.
The deployment takes about 10 to 15 minutes. Afterwards, every infrastructure change goes through the **Infrastructure** workflow,
started by hand: mode `whatif` shows the changes in the run summary and stops; mode `apply` shows them and then deploys. Both modes
wait for the `stage-infra` approval, and a failed what-if fails the run. Deployments are incremental only, so nothing the template
does not mention is ever deleted. Nothing runs by itself when a change under `infra/` is merged.

The outputs give the names you need next (`az deployment group show -g <group> -n main --query properties.outputs`).

## Step 5: Tell GitHub about the new resources

**Environment `stage`** (used by the Deploy and Data workflows). It holds no infrastructure secrets (only the `ADMIN_*` secrets that the `create-admin` action reads, see step 7).

| Name | Value |
|---|---|
| `AZURE_CLIENT_ID` | the `app` client ID from step 2 |
| `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `RESOURCE_GROUP` | as above |
| `VM_NAME`, `KEY_VAULT_NAME`, `POSTGRES_HOST` | the outputs `vmName`, `keyVaultName` (shown as `keyVault` in the Infrastructure run summary), `postgresHost` |
| `POSTGRES_USER`, `POSTGRES_DB` | `postgres` and the database name from the parameter file |
| `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `FROM_EMAIL` | your mail settings (for Gmail `smtp.gmail.com` and `587`) |
| `API_BASE_URL`, `ALLOWED_ORIGINS` | optional: `http://<address>`. Left empty, the VM uses its own public address |

## Step 6: First release

Actions, **Deploy**, Run workflow, and approve it. The workflow:

1. tells the VM to release that commit: it waits for first-boot setup to finish, checks out the commit, signs in with its own
   identity, writes `backend/.env` from Key Vault and the variables above (mode 600), and runs `./deploy.sh`, which builds the
   two images on the VM (the first build takes several minutes);
2. fails the run if `deploy.sh` fails. `deploy.sh` backs up the database first and rolls back by itself if the release fails.

A good run ends with:

```
[deploy] smoke test passed
[deploy] deploy OK
[deploy] NOTE: the database has no data yet (a deploy only creates the structure).
```

## Step 7: Load the data and create the first admin

A new database is empty, as in [DEPLOYMENT.md step 6](DEPLOYMENT.md#step-6-add-the-data-and-the-first-admin). Run the
commands on the VM. As an Owner, the simplest way for the data is a run-command:

```bash
az vm run-command invoke -g <resource-group> -n <vm-name> --command-id RunShellScript \
  --scripts "cd /opt/rationsmart && ./deploy.sh seed --dry-run && ./deploy.sh seed"
```

The first admin asks for a PIN, so use a terminal: add your own address (as `<your-address>/32`) to `sshAllowedCidrs` in the parameter
file, keeping the addresses already there, and apply it (**Infrastructure**, mode `apply`). The single `sshAllowedCidr` is ignored while
that list is not empty, as it is for `stage`. Then `az ssh vm -g <resource-group> -n <vm-name>` and run
`sudo ./deploy.sh create-admin --email you@example.org --name "Your Name" --country-code ETH` in `/opt/rationsmart`.
Remove your address from `sshAllowedCidrs` and apply again afterwards. (Signing in with Entra ID needs the **Virtual Machine Administrator Login** role on the VM.)

Without an Azure login, the **Deploy** and **Data** workflows run the same commands on the VM: actions `seed-dry-run`, `seed` and
`create-admin`. `create-admin` makes the first super admin (email, name and PIN come from the `ADMIN_*` secrets of the `stage`
environment) and is not a routine action, so it only runs when you type `CREATE-ADMIN` in the `confirm` input; it also refuses
by itself when an active super admin already exists.

## Day to day

| I want to... | Do this |
|---|---|
| release a change (everything: both stacks, migrations, database backup) | merge to `main`, then **Deploy**, Run workflow (branch `main`, the only one it accepts), action `up` |
| release a small code change quickly | **Deploy**, action `app-release`, `target` `frontend` or `backend`: only that stack is rebuilt and restarted; a frontend release skips the migrations and the backup. Use `up` when the database, the gateway or both stacks change |
| go back to the previous version | **Deploy**, action `rollback` (code only; the database is not undone); `target` `frontend` or `backend` rolls back just that stack |
| see why a release failed or what the VM is doing | **Deploy**, action `diagnose` (read-only: checkout, containers, listeners, what answers on `localhost`); the output of the VM script ends with a summary of the run's `[deploy]` lines, because Azure keeps only the last ~4 KB |
| change the infrastructure | edit `infra/`, open a PR (the Bicep diff is the review), merge, then run **Infrastructure** by hand and approve it |
| only preview a change | **Infrastructure**, Run workflow, mode `whatif` (approve the environment; nothing is applied) |
| rotate a secret | change it in the **`stage-infra`** GitHub secrets, run **Infrastructure** (apply), then **Deploy**. Editing it only in Key Vault would be overwritten by the next infrastructure run |
| create the report PDF storage (once) | an Owner re-runs **Bootstrap** (`bootstrap`, then `register-providers`), then run **Infrastructure (storage)** with `whatif`, check it, then `apply` and approve it (details [below](#report-pdf-storage-the-storage-workflow)) |
| change only the email password | change `SMTP_PASSWORD` in the **`stage-infra`** GitHub secrets, run **Infrastructure (SMTP secret)**, then **Deploy**, action `app-release`, `target` `backend` |
| change any other setting of the app | change the variable of the **`stage`** environment (or the secret, as above), then **Deploy**, action `app-release`, `target` `backend`. **Never edit `backend/.env` on the VM**: every release writes it again from Key Vault and those variables, so a hand edit is lost (the file says so on its first line) |
| run a `docker compose` command by hand on the VM | in `/opt/rationsmart/backend`: `backend/.env` sets `COMPOSE_FILE=compose.production.yml`, so a plain `docker compose <command>` uses the right file. Never use `compose.test.yml` there: it is the Test server's file, and the API would leave the network the web app and nginx use (every request then fails with a 502) |
| read logs | `az ssh vm ...` then `sudo ./deploy.sh logs api`, or the output of the Deploy run |
| see the VM's setup log | `/var/log/cloud-init-output.log` on the VM |
| a new environment (client tenant) | new parameter file and GitHub environments, then steps 1 to 7 again |

## Test server and this environment

The same code also runs on the team's **Test** server (outside Azure), so `backend/` holds one compose file for each. Neither
has a default name: a `docker compose` that does not say which file to use refuses to run instead of guessing.

| | Test server | This environment (Azure, `stage`) |
|---|---|---|
| Backend compose file | `backend/compose.test.yml` | `backend/compose.production.yml` |
| How it is chosen | `-f` in the Test deploy script; `COMPOSE_FILE=compose.test.yml` in its hand-made `backend/.env` | `-f` in `deploy.sh`; `COMPOSE_FILE=compose.production.yml` in the generated `backend/.env` |
| Release | the Test deploy script, any branch | **Deploy** workflow, branch `main` only |
| `backend/.env` | edited by hand on the server | written by every release; never edit by hand |
| Database / Redis | PostgreSQL on the host; bundled Redis | Azure PostgreSQL (private); bundled Redis with a password |

## When something fails

| You see | Cause | Fix |
|---|---|---|
| `AADSTS70021: No matching federated identity record` | the repository or environment name in the trust does not match the run | re-run the bootstrap with the right `githubRepo` and `environmentName`; check the job's environment |
| `Unable to get ACTIONS_ID_TOKEN_REQUEST_URL` | the job cannot request a token | the job needs `permissions: id-token: write` (already set in the workflows) |
| `AuthorizationFailed` on a role assignment | the `infra` identity may only hand out five roles | add the role to the condition in `infra/bootstrap/oidc.bicep`, or have an Owner create it |
| `SkuNotAvailable` or a quota error | the VM size is missing in that region or zone | change `vmSize` or `zone`, or request quota |
| the Deploy run says first-boot setup has not finished | the VM is still installing Docker | wait a few minutes and run it again; see `/var/log/cloud-init-output.log` |
| the VM cannot clone the repository | the repository is private | give the VM a read-only deploy key (see below) |
| `VaultAlreadyExists` or "a vault with the same name is in a deleted state" | the resource group was recreated: the vault name is the same and the old vault is only soft-deleted | `az keyvault recover --name <vault>` to get it back, or `az keyvault purge --name <vault>` to free the name (not possible if purge protection was on: wait out the retention) |
| database connection times out or the name does not resolve | the database is private: only the VM, inside the virtual network, can reach it (not your computer or the runner) | connect from the VM (`az ssh vm ...`); check the private DNS zone link on the virtual network |
| `MissingSubscriptionRegistration` | a resource provider is not registered on the subscription | run **Bootstrap** with mode `register-providers` |
| `RequestDisallowedByPolicy` | an Azure Policy of your organisation denies a setting (for example public network access) | run **Bootstrap** with mode `preflight`, and ask the policy administrator |

For errors inside the app, [TROUBLESHOOTING.md](TROUBLESHOOTING.md) still applies.

## What the templates create

All in one resource group (`infra/main.bicep` and `infra/modules/`):

| Resource | Details |
|---|---|
| **Network** (`network.bicep`) | virtual network `172.16.0.0/16` with `snet-vm` (`172.16.0.0/24`) and `snet-postgres` (`172.16.1.0/24`, delegated to PostgreSQL); a static Standard public IP in the chosen zone; a network security group attached to the network interface. Rules: port 80 and port 443 from `httpAllowedCidrs` / `httpsAllowedCidrs`, port 22 from `sshAllowedCidrs`, or from `sshAllowedCidr` when that list is empty. A rule exists only when its list is not empty (for SSH: when either value is set), so with both SSH values empty there is no port-22 rule |
| **VM** (`vm.bicep`, `cloud-init.yaml`) | Ubuntu 24.04, Trusted Launch (secure boot, vTPM), 100 GB Premium SSD, SSH key only, system-assigned identity, the Entra ID SSH login extension. On first boot cloud-init installs Docker Engine with the Compose plugin, git and the Azure CLI, clones the repository into `/opt/rationsmart`, and creates `/var/lib/rationsmart-bootstrap.done` when it is finished (a release waits for it) |
| **PostgreSQL Flexible Server** (`postgres.bicep`) | private access only: a delegated subnet plus a private DNS zone linked to the virtual network, so only the VM can reach it; the app connects over TLS (`PGSSLMODE=require`). Storage **auto-grow is disabled** (the 64 GB are a ceiling: watch it and raise `postgresStorageGb`), backups kept 7 days, no high availability, no geo-redundant backup. To recover data, use point-in-time restore from the Azure portal or `az postgres flexible-server restore`: it creates a **new** server, which you then point the app at: set `POSTGRES_HOST` in the `stage` environment, then run the **Deploy** workflow. The running app reads the host only when a release writes its environment file, so the change takes effect only after that run. `deploy.sh` also dumps the database before any release that includes the backend (a frontend-only `app-release` skips it) |
| **Key Vault** (`keyvault.bicep`) | Azure roles only (no access policies), public network access on, soft delete 90 days. Four secrets: `postgres-password`, `jwt-secret-key`, `redis-password`, `smtp-password` |
| **Report PDF storage** (`storage-reports.bicep`, `modules/storage-blob-role.bicep`; **not** part of `main.bicep`) | created only by the **Infrastructure (storage)** workflow: a StorageV2 `Standard_LRS` account `rsreports<8 characters>` (the same suffix as the other names), HTTPS only, TLS 1.2, **shared-key access off**, and one container, `reports`, with anonymous read of a blob by its exact link (no listing). No soft delete or versioning: a deleted PDF is gone. The VM's identity gets *Storage Blob Data Contributor* on this account only |
| **Roles** (`roles.bicep`, `storage-blob-role.bicep`, `bootstrap/oidc.bicep`) | the VM's identity: *Key Vault Secrets User* on the vault and *Storage Blob Data Contributor* on the report storage account. The `app` identity: the custom run-command role on the VM only. The `infra` identity: Contributor on the group plus Role Based Access Control Administrator limited to the roles the templates hand out |

## Secrets: where they live and how they move

```
GitHub secret (stage-infra) --> environment variable --> infra/params/stage.bicepparam (readEnvironmentVariable)
   --> @secure() Bicep parameter --> Key Vault secret --> VM reads it at release (az login --identity)
   --> backend/.env on the VM (mode 600, rewritten at every release)
```

The Deploy workflow never sends a secret to the VM: the VM fetches them from Key Vault with its own identity. A value is changed only
in the GitHub secret, and then pushed with **Infrastructure** (all secrets) or **Infrastructure (SMTP secret)** (the email password
only), then released with **Deploy**. The `create-admin` inputs are the exception: the `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PIN`
secrets of the `stage` environment are masked in the log and sent to the VM for that one action.

### Report PDF storage (the storage workflow)

Production saves each report's PDF to object storage. **Infrastructure (storage)** creates the Azure side, separately from
**Infrastructure**, so a run of one can never touch the other (the Infrastructure workflow does not know this template).
Give it `vm_name` (the `vmName` output of the Infrastructure run; not secret). It then:

1. refuses an invalid VM name, and lints and compiles the template first (no Azure access);
2. runs a what-if of `infra/storage-reports.bicep` and **stops, in both modes**, if the result cannot be read or if anything
   other than the storage account, its blob service, the `reports` container, the role assignment (or the optional lock) would
   change. The first run should show those four creates;
3. with mode `apply`, deploys it incrementally and prints the account and container names.

**Order, once per environment:**

1. An **Owner** re-runs **Bootstrap**, mode `bootstrap` (lets the `infra` identity hand out the fifth role) and then mode
   `register-providers` (registers `Microsoft.Storage`). Until then the role assignment is refused.
2. Run **Infrastructure (storage)** with `whatif`, read the summary, then `apply` and approve `stage-infra`.
3. Note the account name from the output. The app is **not** switched over by this: nothing yet writes the three backend
   settings below into `backend/.env`, so Production still behaves as before.

**No key exists.** Shared-key access is off and nothing is stored in Key Vault. The app on the VM signs in with the VM's managed
identity (the Azure SDK asks the VM's local metadata endpoint for a short-lived token), and the role assignment lets it write to
this one account. The role assignment is named after the identity's principal ID, so it is created again if the VM is ever
recreated.

**The container is publicly readable on purpose.** The backend stores a plain link to each PDF and the browser opens it without
signing in. A reader needs the exact link; the container cannot be listed. Public blob access can be denied by an organisation
policy; if the first `apply` fails with `RequestDisallowedByPolicy`, nothing was created, and the alternative is a private
container with the backend serving the PDFs (a code change).

**How the backend chooses.** `backend/app/config.py` reads `STORAGE_BACKEND` (`aws`, the default, or `azure`),
`AZURE_STORAGE_ACCOUNT` and `AZURE_STORAGE_CONTAINER` (default `reports`). The default keeps the Test server on S3. Azure
settings that are missing or malformed make uploads fail with a clear log line instead of stopping the API.

### Changing only the email password (the SMTP secret workflow)

**Infrastructure (SMTP secret)** exists so that fixing the mail password does not re-evaluate the VM and the database. Give it
`key_vault_name` (the `keyVault` output of the Infrastructure run; not secret). It then:

1. refuses an invalid vault name, and an `SMTP_PASSWORD` that is empty, contains whitespace or a newline (check the ends of the
   pasted value), or contains a single quote (`backend/.env` cannot hold one);
2. runs a what-if of `infra/keyvault-smtp-secret.bicep` and **stops, in both modes**, if the result cannot be read or if anything
   other than the `smtp-password` secret would change (the what-if does not always compare a secret's value, so an empty result
   does not mean the value is right: `apply` still writes it);
3. with mode `apply`, writes the secret as a new version.

Then run **Deploy**, action `app-release`, `target` `backend`: the release rebuilds `backend/.env` from Key Vault.

## Keeping the Cloudflare address list current

The Cloudflare IPv4 ranges appear twice: in `infra/params/stage.bicepparam` (`cloudflareCidrs`, used for ports 80 and 443) and in
the Nginx `set_real_ip_from` lines on the VM (`deploy/https/rationsmart.conf`). When Cloudflare changes its published list
(https://www.cloudflare.com/ips/), change both in the same pull request, run **Infrastructure** (apply) for the firewall, and
reinstall the Nginx file on the VM as described in [`deploy/https/README.md`](deploy/https/README.md).

## Constraints this setup works within

These are the reasons the pipeline looks the way it does. Check the reason before you "simplify" any of them.

| What you see | Why |
|---|---|
| Workflows sign in with `curl` and `az login --federated-token`, not the `azure/login` action | the organisation allows only GitHub-owned actions; a workflow that uses another action fails at startup |
| No container registry; the VM builds the images (`FORCE_BUILD=1`) | the UCD Azure Policy *Deny Public Network Access* denies public registries and public PostgreSQL servers |
| PostgreSQL in a delegated subnet with a private DNS zone | the same policy; private access has to be chosen when the server is created |
| `az vm run-command create` is given `--location` read from the VM | the `app` identity may not read the resource group; its role covers only the VM |
| The Deploy run prints a short summary of the `[deploy]` lines last | Azure returns only the last ~4 KB of a run-command's output |
| The what-if steps write to a file and then check the exit code of `az` | a pipe without `pipefail` once showed a failed what-if as green |
| Bootstrap has no environment and no approval | the Owner identity is trusted by branch, and GitHub issues that kind of token only to jobs without an environment; protect the trusted branches |
| Key Vault is public | the policy initiative does not list Key Vault; reads still need the Azure role |
| The report storage has its own workflow and is not in `main.bicep` | a run of the Infrastructure workflow must never create, change or be blocked by it; the storage workflow's what-if refuses to touch anything else |
| The report container is publicly readable and the account has no keys | the backend stores plain links that browsers open without signing in; writes use the VM's managed identity, so no secret exists to store or rotate |

## Good to know

- **Private repository:** the VM clones over plain HTTPS. For a private repository, create a read-only deploy key, store it in
  Key Vault, and change `infra/cloud-init.yaml` and `deploy/vm-deploy.sh` to use it. Not built yet.
- **Images are built on the VM:** `deploy.sh` runs with `FORCE_BUILD=1`, so every release rebuilds from the commit and needs
  free disk (the VM has 100 GB). There is no registry and no image kept outside the VM.
- **Database access:** PostgreSQL has no public address; the Key Vault does (reads need the Azure role).
- **The first release has no rollback point** (nothing was running before it); later ones do.
- **HTTPS on the gateway:** the repository's gateway serves plain http. On the stage VM the gateway also serves https for
  `rationsmart.ucdavis.edu` (Cloudflare in front), so that port 80 only redirects to https. That part is installed **by hand** on the
  VM (certificate, key, Nginx file and an untracked `gateway/docker-compose.override.yml`); the repository keeps copies and the
  restore steps in [`deploy/https/`](deploy/https/README.md). Bicep manages only the firewall side: ports 80 and 443 from the
  Cloudflare ranges, SSH from the developer addresses. The smoke test in `deploy.sh` recognises the redirect and checks the https
  server on the VM instead (`GATEWAY_TLS_PORT`, default 443).

## Staging HTTPS

The staging hostname uses Cloudflare Full (strict), an Origin CA certificate on the VM, and a local gateway Compose override. See [HTTPS installation and recovery](deploy/https/README.md) for the files to restore after VM replacement. The staging Bicep parameters preserve Cloudflare-only web access and the two developer SSH source IPs.

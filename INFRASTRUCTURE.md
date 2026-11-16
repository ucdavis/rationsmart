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

## Before you start

| You need | Notes |
|---|---|
| An **empty resource group** | for example `rg-rationsmart-stage` |
| **Owner** on that group (or Contributor plus User Access Administrator) | needed once, to create the pipeline identities and their roles. The resource providers Compute, Network, DBforPostgreSQL, KeyVault and ManagedIdentity must be registered on the subscription (the **Bootstrap** workflow, mode `register-providers`, does it) |
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
| `vmSize`, `zone` | the VM | `Standard_D4as_v6`, zone 2 (zone 1 is restricted in this subscription) |
| `postgresSkuName`, `postgresStorageGb`, `postgresVersion` | the database server | Burstable `Standard_B2s`, 64 GB, version 15 |
| `sshAllowedCidr` | address range allowed to reach SSH (port 22) | empty: SSH closed, sign in with Entra ID |
| `repoUrl` | what the VM clones on first boot (its default branch; each release then checks out its own commit). The Infrastructure workflow sets `REPO_URL` to the repository it runs in | this repository |

Names that must be unique across Azure (the vault and database server) get a suffix made from the resource group, so
two environments never clash.

## Step 2: Create the pipeline identities (once, by an Owner)

Follow **[infra/bootstrap/README.md](infra/bootstrap/README.md)**. It creates two identities that GitHub signs in as, bound to this
repository and to one GitHub environment each, so a run from a fork or an unapproved environment gets no access:

| Identity | GitHub environment | Can |
|---|---|---|
| `infra` | `stage-infra` | change resources in the group, and hand out only the roles the templates assign (Key Vault secret read, run-command on a VM) |
| `app` | `stage` | push images, and run commands on the one VM (nothing else) |

## Step 3: Set up GitHub

In the repository, Settings, Environments: create **`stage-infra`** and **`stage`**. On both, add **required reviewers**, turn on
**prevent self-review**, and set **deployment branches** to `main` only. The reviewers on `stage-infra` are not optional: they
are the only gate before a run changes Azure. The Bootstrap, Infrastructure and Deploy workflows run **only when you start them
by hand** (Actions, Run workflow); none has a push or pull-request trigger. To add one later, edit its `on:` block in a pull
request to `main`, and make sure the reviewers are set first. Then add:

> **Testing from a branch or fork:** run the workflow by hand (**Run workflow**) and, in the fork only, let the environments
> deploy from `main` plus `test/*`. A fork also needs its own bootstrap run with `githubRepo=<fork owner>/<fork name>`.
>
> **No personal Azure login:** if someone else gives you a managed identity with Owner on the subscription (trusted for
> branches such as `main` or `test/azure-pipeline`), skip the `az` commands in step 2. Put that identity's IDs in
> repository-level variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID`, and run the **Bootstrap**
> workflow from a trusted branch with a resource group name (the job has no environment). Then set the `stage-infra` and
> `stage` variables from the run summary and delete the repository-level ones. The `Infrastructure` and `Deploy`
> workflows still need those environments to allow the branch you run from.

**Environment `stage-infra`** (used by the Infrastructure workflow)

| Name | Kind | Value |
|---|---|---|
| `AZURE_CLIENT_ID` | variable | the `infra` client ID from step 2 |
| `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `RESOURCE_GROUP` | variable | your tenant, subscription and group |
| `ADMIN_SSH_PUBLIC_KEY` | variable | contents of your `.pub` file |
| `APP_IDENTITY_PRINCIPAL_ID`, `RUN_COMMAND_ROLE_ID` | variable | outputs of step 2 |
| `POSTGRES_ADMIN_PASSWORD`, `JWT_SECRET_KEY`, `REDIS_PASSWORD`, `SMTP_PASSWORD` | **secret** | see below |

Make the three generated secrets with `openssl rand -hex 24` (hex needs no escaping in a database URL, and Redis requires it).
`SMTP_PASSWORD` is your email account's password and must not contain a single quote (`'`).

The secrets are used once, as inputs to the infrastructure run; they are stored in Key Vault, and the VM reads them there.

## Step 4: Create the environment

Run the **first** deployment from your computer (or run the **Infrastructure** workflow by hand once its variables are set). The parameter file reads its secrets and identity values from environment variables, so set them in your shell
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
The deployment takes about 10 to 15 minutes. Afterwards, the **Infrastructure** workflow takes over: a change under `infra/`
shows a what-if in the run summary and, after approval, applies it (incremental only, so it never deletes anything the template
does not mention).

The outputs give the names you need next (`az deployment group show -g <group> -n main --query properties.outputs`).

## Step 5: Tell GitHub about the new resources

**Environment `stage`** (used by the Deploy workflow). It holds no secrets.

| Name | Value |
|---|---|
| `AZURE_CLIENT_ID` | the `app` client ID from step 2 |
| `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `RESOURCE_GROUP` | as above |
| `VM_NAME`, `KEY_VAULT_NAME`, `POSTGRES_HOST` | the outputs `vmName`, `keyVaultName`, `postgresHost` |
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

The first admin asks for a PIN, so use a terminal: set `sshAllowedCidr` to your own address in the parameter file, apply it,
then `az ssh vm -g <resource-group> -n <vm-name>` and run
`sudo ./deploy.sh create-admin --email you@example.org --name "Your Name" --country-code ETH` in `/opt/rationsmart`.
Remove `sshAllowedCidr` and apply again afterwards. (Signing in with Entra ID needs the **Virtual Machine Administrator Login** role on the VM.)

## Day to day

| I want to... | Do this |
|---|---|
| release a change | merge to `main`, then **Deploy**, Run workflow, and approve it |
| go back to the previous version | **Deploy**, Run workflow, action `rollback` (code only; the database is not undone) |
| change the infrastructure | edit `infra/`, open a PR (the Bicep diff is the review), merge, then run **Infrastructure** by hand and approve it |
| only preview a change | **Infrastructure**, Run workflow, mode `whatif` (approve the environment; nothing is applied) |
| rotate a secret | change it in the **`stage-infra`** GitHub secrets, run **Infrastructure** (apply), then **Deploy**. Editing it only in Key Vault would be overwritten by the next infrastructure run |
| read logs | `az ssh vm ...` then `sudo ./deploy.sh logs api`, or the output of the Deploy run |
| see the VM's setup log | `/var/log/cloud-init-output.log` on the VM |
| a new environment (client tenant) | new parameter file and GitHub environments, then steps 1 to 7 again |

## When something fails

| You see | Cause | Fix |
|---|---|---|
| `AADSTS70021: No matching federated identity record` | the repository or environment name in the trust does not match the run | re-run the bootstrap with the right `githubRepo` and `environmentName`; check the job's environment |
| `Unable to get ACTIONS_ID_TOKEN_REQUEST_URL` | the job cannot request a token | the job needs `permissions: id-token: write` (already set in the workflows) |
| `AuthorizationFailed` on a role assignment | the `infra` identity may only hand out four roles | add the role to the condition in `infra/bootstrap/oidc.bicep`, or have an Owner create it |
| `SkuNotAvailable` or a quota error | the VM size is missing in that region or zone | change `vmSize` or `zone`, or request quota |
| the Deploy run says first-boot setup has not finished | the VM is still installing Docker | wait a few minutes and run it again; see `/var/log/cloud-init-output.log` |
| the VM cannot clone the repository | the repository is private | give the VM a read-only deploy key (see below) |
| `VaultAlreadyExists` or "a vault with the same name is in a deleted state" | the resource group was recreated: the vault name is the same and the old vault is only soft-deleted | `az keyvault recover --name <vault>` to get it back, or `az keyvault purge --name <vault>` to free the name (not possible if purge protection was on: wait out the retention) |
| database connection times out or the name does not resolve | the database is private: only the VM, inside the virtual network, can reach it (not your computer or the runner) | connect from the VM (`az ssh vm ...`); check the private DNS zone link on the virtual network |
| `MissingSubscriptionRegistration` | a resource provider is not registered on the subscription | run **Bootstrap** with mode `register-providers` |
| `RequestDisallowedByPolicy` | an Azure Policy of your organisation denies a setting (for example public network access) | run **Bootstrap** with mode `preflight`, and ask the policy administrator |

For errors inside the app, [TROUBLESHOOTING.md](TROUBLESHOOTING.md) still applies.

## Good to know

- **Private repository:** the VM clones over plain HTTPS. For a private repository, create a read-only deploy key, store it in
  Key Vault, and change `infra/cloud-init.yaml` and `deploy/vm-deploy.sh` to use it. Not built yet.
- **Images are built on the VM:** `deploy.sh` runs with `FORCE_BUILD=1`, so every release rebuilds from the commit and needs
  free disk (the VM has 100 GB). There is no registry and no image kept outside the VM.
- **Database access:** PostgreSQL has no public address; the Key Vault does (reads need the Azure role).
- **The first release has no rollback point** (nothing was running before it); later ones do.
- The app is served over plain `http`; https and a domain name are not part of this setup.

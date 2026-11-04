# RationSmart on Azure: create the environment and release with GitHub Actions

This guide builds the whole Azure environment from templates (Bicep), and releases new versions from GitHub with no stored
Azure password (OIDC sign-in). The release itself is still done by [`deploy.sh`](deploy.sh) on the server, exactly as in
**[DEPLOYMENT.md](DEPLOYMENT.md)**. Use DEPLOYMENT.md instead if you deploy by hand on a server you set up yourself.

```
  merge to main ──> GitHub Actions ──(OIDC, no password)──> Azure
                        │                                    ├─ Container Registry  <── images pushed by the workflow
                        │                                    ├─ VM  ── runs deploy.sh ──> PostgreSQL Flexible Server
                        └─ run-command on the VM ───────────┘   └─ reads its secrets from Key Vault
```

What gets created in one resource group: a virtual network and firewall, **one Ubuntu 24.04 VM**, a **PostgreSQL Flexible Server**
with the app database, a **Container Registry** (private), a **Key Vault**, and the permissions between them. An optional storage
account is off by default.

## Before you start

| You need | Notes |
|---|---|
| An **empty resource group** | for example `rg-rationsmart-stage` |
| **Owner** on that group (or Contributor plus User Access Administrator) | needed once, to create the pipeline identities and their roles. The resource providers Compute, Network, DBforPostgreSQL, ContainerRegistry, KeyVault and ManagedIdentity must be registered on the subscription |
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
| `vmSize`, `zone` | the VM | `Standard_D4as_v6`, zone 1 |
| `postgresSkuName`, `postgresStorageGb`, `postgresVersion` | the database server | Burstable `Standard_B2s`, 64 GB, version 15 |
| `sshAllowedCidr` | address range allowed to reach SSH (port 22) | empty: SSH closed, sign in with Entra ID |
| `repoUrl`, `repoBranch` | what the VM clones on first boot | this repository, `main` |
| `anonymousRegistryPull`, `deployStorage` | public image pulls; the optional storage account | both off |

Names that must be unique across Azure (the registry, vault and database server) get a suffix made from the resource group, so
two environments never clash.

## Step 2: Create the pipeline identities (once, by an Owner)

Follow **[infra/bootstrap/README.md](infra/bootstrap/README.md)**. It creates two identities that GitHub signs in as, bound to this
repository and to one GitHub environment each, so a run from a fork or an unapproved environment gets no access:

| Identity | GitHub environment | Can |
|---|---|---|
| `infra` | `stage-infra` | change resources in the group, and hand out only four roles (registry pull and push, Key Vault secret read, run-command on a VM) |
| `app` | `stage` | push images, and run commands on the one VM (nothing else) |

## Step 3: Set up GitHub

In the repository, Settings, Environments: create **`stage-infra`** and **`stage`**. On both, add **required reviewers**, turn on
**prevent self-review**, and set **deployment branches** to `main` only. Then add:

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

Run the **first** deployment from your computer, because the workflows only run from `main` (merge them first if you prefer
the workflow). The parameter file reads its secrets and identity values from environment variables, so set them in your shell
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

Read the what-if first: it should list the VM, database server, registry, vault, network and roles, all as **Create**.
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
| `VM_NAME`, `ACR_LOGIN_SERVER`, `KEY_VAULT_NAME`, `POSTGRES_HOST` | the outputs `vmName`, `registryLoginServer`, `keyVaultName`, `postgresHost` |
| `POSTGRES_USER`, `POSTGRES_DB` | `postgres` and the database name from the parameter file |
| `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `FROM_EMAIL` | your mail settings (for Gmail `smtp.gmail.com` and `587`) |
| `API_BASE_URL`, `ALLOWED_ORIGINS` | optional: `http://<address>`. Left empty, the VM uses its own public address |

## Step 6: First release

Actions, **Deploy**, Run workflow (or merge a change to `main`), and approve it. The workflow:

1. builds the two images on the runner and pushes them to your registry, tagged with the commit;
2. tells the VM to release that commit: it waits for first-boot setup to finish, signs in with its own identity, writes
   `backend/.env` from Key Vault and the variables above (mode 600), and runs `./deploy.sh`;
3. fails the run if `deploy.sh` fails. `deploy.sh` backs up the database first and rolls back by itself if the release fails.

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
| release a change | merge to `main` and approve the **Deploy** run |
| go back to the previous version | **Deploy**, Run workflow, action `rollback` (code only; the database is not undone) |
| change the infrastructure | edit `infra/`, merge, read the what-if, approve |
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
| image pull "unauthorized" on the VM | the registry pull role is not in place yet | wait a few minutes, run Deploy again |
| the VM cannot clone the repository | the repository is private | give the VM a read-only deploy key (see below) |
| database connection times out | the firewall rule holds a different address | the address is static; apply the infrastructure again |

For errors inside the app, [TROUBLESHOOTING.md](TROUBLESHOOTING.md) still applies.

## Good to know

- **Private repository:** the VM clones over plain HTTPS. For a private repository, create a read-only deploy key, store it in
  Key Vault, and change `infra/cloud-init.yaml` and `deploy/vm-deploy.sh` to use it. Not built yet.
- **Registry visibility:** the registry is private and has no admin login. Setting `anonymousRegistryPull` makes **every** image in it public.
- **The first release has no rollback point** (nothing was running before it); later ones do.
- The app is served over plain `http`; https and a domain name are not part of this setup.

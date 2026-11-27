# One-time setup: the pipeline identities

Run **once per environment**, by someone who is **Owner** on the resource group (or Contributor plus User Access Administrator).
It needs no Entra ID (directory) role: it creates managed identities, not app registrations.

It creates:

- the **`infra` identity**, trusted by the GitHub environment `<env>-infra`. It gets Contributor on the group, and Role Based
  Access Control Administrator **limited by a condition** to five roles: AcrPull, AcrPush (no longer used: there is no registry), Key Vault Secrets User, Storage
  Blob Data Contributor (the VM writes the report PDFs to its storage account) and the run-command role below;
- the **`app` identity**, trusted by the GitHub environment `<env>`. It gets no role here: `infra/main.bicep` gives it the run-command
  role on the VM, because that resource does not exist yet;
- the **run-command role**: read the VM, and create, read and delete run commands on it. Nothing else.

## Run it

### Option 1: the Bootstrap workflow (no personal Azure login)

Actions, **Bootstrap**, Run workflow. It has three modes, all started by hand, all run as an **Owner** identity on the subscription:

| Mode | What it does |
|---|---|
| `bootstrap` | creates the resource group (inputs `resource_group`, `location`) and runs `oidc.bicep`. The run summary prints the (non-secret) outputs listed below |
| `register-providers` | registers the resource providers the templates use (Compute, Network, DBforPostgreSQL, KeyVault, ManagedIdentity, Authorization, Storage). The `infra` identity cannot: that is a subscription-level action. Idempotent, creates nothing |
| `preflight` | read-only: provider registration, vCPU quota, VM and PostgreSQL size availability, and the policy assignments that apply. Changes nothing; run it before the Infrastructure workflow |

The jobs have **no GitHub environment**, so there is no approval step. They read the **repository-level** variables
`AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` (the Owner identity), and the Owner identity only trusts runs from the
branches it was set up for (`main` and `test/azure-pipeline`). Start the run from one of those branches. After `bootstrap`, put the
outputs into the environment variables in the table below, then **delete the three repository-level variables**.

### Option 2: from your computer

```bash
az login
az account set --subscription <subscription-id>

az deployment group create \
  --resource-group <resource-group> \
  --name oidc \
  --template-file infra/bootstrap/oidc.bicep \
  --parameters githubRepo=ucdavis/rationsmart environmentName=stage

az deployment group show --resource-group <resource-group> --name oidc --query properties.outputs
```

### The outputs (both options)

They are not secret:

| Output | Goes to |
|---|---|
| `infraClientId` | GitHub variable `AZURE_CLIENT_ID` in the environment `<env>-infra` |
| `appClientId` | GitHub variable `AZURE_CLIENT_ID` in the environment `<env>` |
| `appPrincipalId` | GitHub variable `APP_IDENTITY_PRINCIPAL_ID` in `<env>-infra` |
| `runCommandRoleId` | GitHub variable `RUN_COMMAND_ROLE_ID` in `<env>-infra` |
| `tenantId` | GitHub variable `AZURE_TENANT_ID` in both environments |

For example, with the GitHub CLI: `gh variable set AZURE_CLIENT_ID --env stage-infra --body <infraClientId>`.

## Notes

- The trust is the pair *repository + environment name* (`repo:<owner>/<repo>:environment:<env>`). Renaming or transferring the
  repository, or renaming an environment, breaks it: run this again with the new names.
- It is safe to run again (incremental). It never deletes anything.
- To allow another role to be handed out by the pipeline, add its ID to `allowedRoles` in `oidc.bicep` and run it again.
- **After pulling the report-storage change, run `bootstrap` and then `register-providers` once more** (as an Owner). Without the
  fifth role in the condition, the **Infrastructure (storage)** workflow's role assignment is refused, and without `Microsoft.Storage`
  registered the storage account cannot be created. Re-running changes only that condition: the identities, their trust and the
  run-command role stay as they are. With Option 1 (the workflow), the three repository-level variables were deleted after the
  first run, so:
  1. add the repository-level variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` (the Owner identity) again;
  2. run `bootstrap`, then `register-providers`;
  3. delete the three repository-level variables again.

  With Option 2 (from your computer), `az login` as an Owner is enough; no GitHub variable is needed.

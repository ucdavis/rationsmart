# One-time setup: the pipeline identities

Run **once per environment**, by someone who is **Owner** on the resource group (or Contributor plus User Access Administrator).
It needs no Entra ID (directory) role: it creates managed identities, not app registrations.

It creates:

- the **`infra` identity**, trusted by the GitHub environment `<env>-infra`. It gets Contributor on the group, and Role Based
  Access Control Administrator **limited by a condition** to four roles: AcrPull, AcrPush, Key Vault Secrets User and the
  run-command role below;
- the **`app` identity**, trusted by the GitHub environment `<env>`. It gets no role here: `infra/main.bicep` gives it AcrPush
  on the registry and the run-command role on the VM, because those resources do not exist yet;
- the **run-command role**: read the VM, and create, read and delete run commands on it. Nothing else.

## Run it

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

The outputs are not secret:

| Output | Goes to |
|---|---|
| `infraClientId` | GitHub variable `AZURE_CLIENT_ID` in the environment `<env>-infra` |
| `appClientId` | GitHub variable `AZURE_CLIENT_ID` in the environment `<env>` |
| `appPrincipalId` | GitHub variable `APP_IDENTITY_PRINCIPAL_ID` in `<env>-infra` |
| `runCommandRoleId` | GitHub variable `RUN_COMMAND_ROLE_ID` in `<env>-infra` |
| `tenantId` | GitHub variable `AZURE_TENANT_ID` in both |

For example, with the GitHub CLI: `gh variable set AZURE_CLIENT_ID --env stage-infra --body <infraClientId>`.

## Notes

- The trust is the pair *repository + environment name* (`repo:<owner>/<repo>:environment:<env>`). Renaming or transferring the
  repository, or renaming an environment, breaks it: run this again with the new names.
- It is safe to run again (incremental). It never deletes anything.
- To allow another role to be handed out by the pipeline, add its ID to `allowedRoles` in `oidc.bicep` and run it again.

// Role assignments that need resources created by main.bicep, so they cannot be made by the one-time bootstrap.
// Every role here is one the "infra" identity is allowed to hand out (see bootstrap/oidc.bicep).
//
//   VM identity   -> Key Vault Secrets User on the vault
//   app identity  -> the run-command role on the VM only

param vmPrincipalId string
param appPrincipalId string
param keyVaultName string
param vmName string

@description('Resource ID of the custom run-command role created by bootstrap/oidc.bicep')
param runCommandRoleId string

var keyVaultSecretsUserId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource vm 'Microsoft.Compute/virtualMachines@2024-07-01' existing = {
  name: vmName
}

resource vmReadsSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, vmPrincipalId, keyVaultSecretsUserId)
  properties: {
    roleDefinitionId: keyVaultSecretsUserId
    principalId: vmPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource appRunsCommands 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vm
  name: guid(vm.id, appPrincipalId, runCommandRoleId)
  properties: {
    roleDefinitionId: runCommandRoleId
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
  }
}

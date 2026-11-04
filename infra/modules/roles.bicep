// Role assignments that need resources created by main.bicep, so they cannot be made by the one-time bootstrap.
// Every role here is one the "infra" identity is allowed to hand out (see bootstrap/oidc.bicep).
//
//   VM identity   -> AcrPull on the registry, Key Vault Secrets User on the vault
//   app identity  -> AcrPush on the registry, the run-command role on the VM only

param vmPrincipalId string
param appPrincipalId string
param registryName string
param keyVaultName string
param vmName string

@description('Resource ID of the custom run-command role created by bootstrap/oidc.bicep')
param runCommandRoleId string

var acrPullId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var acrPushId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f252e45ec')
var keyVaultSecretsUserId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-40c2-a5b2-1ac8fb4b3b41')

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' existing = {
  name: registryName
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource vm 'Microsoft.Compute/virtualMachines@2024-07-01' existing = {
  name: vmName
}

resource vmPullsImages 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, vmPrincipalId, acrPullId)
  properties: {
    roleDefinitionId: acrPullId
    principalId: vmPrincipalId
    principalType: 'ServicePrincipal'
  }
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

resource appPushesImages 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, appPrincipalId, acrPushId)
  properties: {
    roleDefinitionId: acrPushId
    principalId: appPrincipalId
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

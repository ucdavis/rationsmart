// Storage Blob Data Contributor for one principal on one existing storage account (used by infra/storage-reports.bicep).
//
// A module on purpose: the name of a role assignment must be known at the start of the deployment, and a VM's
// principal ID is only known while it runs. As a module parameter it is a plain value here, so the name can include it
// (the same reason infra/modules/roles.bicep takes vmPrincipalId). A name that does not change with the principal would
// make Azure refuse the deployment (RoleAssignmentUpdateNotPermitted) if the VM were ever recreated under the same name.

param storageAccountName string
param principalId string

var storageBlobDataContributorId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource writesBlobs 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, principalId, storageBlobDataContributorId)
  properties: {
    roleDefinitionId: storageBlobDataContributorId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

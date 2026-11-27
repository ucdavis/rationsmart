// Storage for the report PDFs of the stage (production) environment. Standalone: it is NOT part of main.bicep, so the
// Infrastructure workflow never creates or changes it. Run by .github/workflows/infra-storage.yml, started by hand only.
//
// No key and no connection string exist: shared-key access is off. The VM signs in with its managed identity, which
// gets Storage Blob Data Contributor on this account only. The VM itself is not part of this deployment: only its principal ID is passed in.
// The container allows anonymous read of a blob by its exact link (no listing), because the backend stores a plain
// link to each PDF and the browser opens it without signing in.

param location string = resourceGroup().location

@description('Principal ID of the VM managed identity that writes the PDFs. The workflow looks it up with az vm show, so the what-if can evaluate the role assignment (a value read from the VM inside the template cannot be).')
param vmPrincipalId string

@description('Adds a CanNotDelete lock on the account. Removing a lock needs an Owner.')
param lockAccount bool = false

// Same suffix as main.bicep (uniqueString of the resource group), so the name is the same on every run.
var storageAccountName = 'rsreports${take(uniqueString(resourceGroup().id), 8)}'
var containerName = 'reports'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowSharedKeyAccess: false
    allowBlobPublicAccess: true
    publicNetworkAccess: 'Enabled'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  // No soft delete, no versioning: a deleted PDF is gone.
}

resource reportsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: containerName
  properties: {
    // Blob: anonymous read by exact link, no listing (Container would also allow listing).
    publicAccess: 'Blob'
  }
}

// The assignment is named after the principal, so it lives in a module (see the comment there).
module vmWritesReports 'modules/storage-blob-role.bicep' = {
  name: 'report-storage-vm-role'
  params: {
    storageAccountName: storage.name
    principalId: vmPrincipalId
  }
}

resource noDelete 'Microsoft.Authorization/locks@2020-05-01' = if (lockAccount) {
  scope: storage
  name: 'no-delete'
  properties: { level: 'CanNotDelete', notes: 'Report PDFs. Remove only with the backend owner approval.' }
}

output storageAccountName string = storage.name
output containerName string = reportsContainer.name

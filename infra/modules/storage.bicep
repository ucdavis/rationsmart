// Optional storage account. Off by default: the dev environment has one, but no part of the app uses it.
// Unlike the dev account, public blob access is off.

param name string
param location string
param skuName string = 'Standard_LRS'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  kind: 'StorageV2'
  sku: { name: skuName }
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

output name string = storage.name

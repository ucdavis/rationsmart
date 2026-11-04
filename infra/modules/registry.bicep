// Container registry for the two app images (rationsmart-api, rationsmart-pwa).
// The admin user stays off: the pipeline pushes with its identity and the VM pulls with its own (see roles.bicep).

param name string
param location string

@description('Allow pulling without signing in. Applies to every repository in the registry.')
param anonymousPull bool = false

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: name
  location: location
  sku: { name: 'Standard' }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: anonymousPull
    publicNetworkAccess: 'Enabled'
  }
}

output name string = registry.name
output loginServer string = registry.properties.loginServer

// Key Vault that holds the four app secrets. Access is by Azure roles only (no access policies);
// the VM's identity gets "Key Vault Secrets User" in roles.bicep.

param name string
param location string

@secure()
param postgresPassword string
@secure()
param jwtSecretKey string
@secure()
param redisPassword string
@secure()
param smtpPassword string

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
  }
}

resource postgresSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'postgres-password'
  properties: { value: postgresPassword }
}

resource jwtSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'jwt-secret-key'
  properties: { value: jwtSecretKey }
}

resource redisSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'redis-password'
  properties: { value: redisPassword }
}

resource smtpSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'smtp-password'
  properties: { value: smtpPassword }
}

output name string = vault.name

// PostgreSQL Flexible Server (same shape as the dev server): Burstable, public access with a firewall rule
// that admits only the VM's public address. The app connects over TLS (PGSSLMODE=require).

param name string
param location string
param zone string
param skuName string = 'Standard_B2s'
param skuTier string = 'Burstable'
param version string = '15'
param storageSizeGb int = 64
param backupRetentionDays int = 7
param adminLogin string = 'postgres'
param databaseName string

@secure()
param adminPassword string

@description('Public address of the VM; the only address allowed through the firewall.')
param vmPublicIp string

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: name
  location: location
  sku: { name: skuName, tier: skuTier }
  properties: {
    version: version
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    availabilityZone: zone
    storage: { storageSizeGB: storageSizeGb, autoGrow: 'Disabled' }
    backup: { backupRetentionDays: backupRetentionDays, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Enabled'
      tenantId: tenant().tenantId
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Changes to one server are applied one at a time, so the firewall rule waits for the database.
resource allowVm 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: server
  name: 'allow-vm'
  dependsOn: [database]
  properties: {
    startIpAddress: vmPublicIp
    endIpAddress: vmPublicIp
  }
}

output host string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name

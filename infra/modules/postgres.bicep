// PostgreSQL Flexible Server with private access only (VNet integration): the server sits in a delegated subnet and
// its name resolves to a private address through a private DNS zone linked to the virtual network, so only machines
// in that network (the VM) can reach it. Public network access is not enabled: the UCD policy denies it. The app
// connects over TLS (PGSSLMODE=require). Private access must be chosen when the server is created.

param name string
param location string
param skuName string = 'Standard_B2s'
param skuTier string = 'Burstable'
param version string = '15'
param storageSizeGb int = 64
param backupRetentionDays int = 7
param adminLogin string = 'postgres'
param databaseName string

@secure()
param adminPassword string

@description('Subnet delegated to Microsoft.DBforPostgreSQL/flexibleServers that holds the server.')
param delegatedSubnetId string

@description('Virtual network the private DNS zone is linked to, so the VM resolves the server name.')
param vnetId string

// The zone name must end in .postgres.database.azure.com.
var privateDnsZoneName = '${name}.private.postgres.database.azure.com'

resource dnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: privateDnsZoneName
  location: 'global'
}

resource dnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dnsZone
  name: '${name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnetId }
  }
}

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: name
  location: location
  // The zone link must exist before the server, or the server cannot register its name in the zone.
  dependsOn: [dnsLink]
  sku: { name: skuName, tier: skuTier }
  properties: {
    version: version
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    storage: { storageSizeGB: storageSizeGb, autoGrow: 'Disabled' }
    backup: { backupRetentionDays: backupRetentionDays, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: delegatedSubnetId
      privateDnsZoneArmResourceId: dnsZone.id
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

output host string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name

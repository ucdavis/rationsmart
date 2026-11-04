// RationSmart environment: one VM (runs the three docker compose stacks), PostgreSQL Flexible Server,
// container registry and Key Vault, in an existing, empty resource group.
//
//   az deployment group create --resource-group <group> --template-file infra/main.bicep --parameters infra/params/<env>.bicepparam
//
// Run it in incremental mode (the default); never use --mode Complete. Secrets are read from environment
// variables by the parameter file, so none is stored in the repository. See INFRASTRUCTURE.md.

targetScope = 'resourceGroup'

@description('Region of every resource. Defaults to the resource group\'s region.')
param location string = resourceGroup().location

@description('Prefix for resource names, for example rationsmart-stage.')
@minLength(3)
@maxLength(30)
param namePrefix string

@description('Makes the globally unique names (registry, vault, database server) unique to this resource group.')
param nameSuffix string = uniqueString(resourceGroup().id)

// ── VM ──
param vmSize string = 'Standard_D4as_v6'
param zone string = '1'
param adminUsername string = 'ubuntu'
@description('Public key of the VM administrator (the .pub file). Not a secret.')
param adminSshPublicKey string
@description('Address range allowed to reach SSH. Empty keeps port 22 closed (use Entra ID SSH).')
param sshAllowedCidr string = ''
param allowHttps bool = false
@description('Repository the VM clones on first boot. A private repository needs a deploy key, see INFRASTRUCTURE.md.')
param repoUrl string = 'https://github.com/ucdavis/rationsmart.git'
param repoBranch string = 'main'

// ── PostgreSQL ──
param postgresSkuName string = 'Standard_B2s'
param postgresSkuTier string = 'Burstable'
param postgresVersion string = '15'
param postgresStorageGb int = 64
param postgresAdminUser string = 'postgres'
param databaseName string

// ── Secrets (from environment variables in the parameter file) ──
@secure()
param postgresAdminPassword string
@secure()
param jwtSecretKey string
@secure()
param redisPassword string
@secure()
param smtpPassword string

// ── Pipeline identities, created once by bootstrap/oidc.bicep ──
@description('Principal ID of the "app" identity (output of the bootstrap).')
param appIdentityPrincipalId string
@description('Resource ID of the run-command role (output of the bootstrap).')
param runCommandRoleId string

param anonymousRegistryPull bool = false
param deployStorage bool = false

var compactPrefix = replace(namePrefix, '-', '')
var vmName = '${namePrefix}-vm'
var registryName = take('${compactPrefix}${nameSuffix}', 50)
var keyVaultName = 'kv-${take(compactPrefix, 8)}-${take(nameSuffix, 10)}'
var postgresName = toLower('${namePrefix}-pg-${take(nameSuffix, 8)}')

module network 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    prefix: namePrefix
    zone: zone
    sshAllowedCidr: sshAllowedCidr
    allowHttps: allowHttps
  }
}

module registry 'modules/registry.bicep' = {
  name: 'registry'
  params: {
    name: registryName
    location: location
    anonymousPull: anonymousRegistryPull
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: {
    name: keyVaultName
    location: location
    postgresPassword: postgresAdminPassword
    jwtSecretKey: jwtSecretKey
    redisPassword: redisPassword
    smtpPassword: smtpPassword
  }
}

module vm 'modules/vm.bicep' = {
  name: 'vm'
  params: {
    name: vmName
    location: location
    zone: zone
    vmSize: vmSize
    adminUsername: adminUsername
    adminSshPublicKey: adminSshPublicKey
    nicId: network.outputs.nicId
    repoUrl: repoUrl
    repoBranch: repoBranch
  }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    name: postgresName
    location: location
    zone: zone
    skuName: postgresSkuName
    skuTier: postgresSkuTier
    version: postgresVersion
    storageSizeGb: postgresStorageGb
    adminLogin: postgresAdminUser
    adminPassword: postgresAdminPassword
    databaseName: databaseName
    vmPublicIp: network.outputs.publicIpAddress
  }
}

module roles 'modules/roles.bicep' = {
  name: 'roles'
  params: {
    vmPrincipalId: vm.outputs.principalId
    appPrincipalId: appIdentityPrincipalId
    registryName: registry.outputs.name
    keyVaultName: keyVault.outputs.name
    vmName: vm.outputs.name
    runCommandRoleId: runCommandRoleId
  }
}

module storage 'modules/storage.bicep' = if (deployStorage) {
  name: 'storage'
  params: {
    name: take('${compactPrefix}${nameSuffix}', 24)
    location: location
  }
}

output vmName string = vm.outputs.name
output vmPublicIp string = network.outputs.publicIpAddress
output registryName string = registry.outputs.name
output registryLoginServer string = registry.outputs.loginServer
output keyVaultName string = keyVault.outputs.name
output postgresHost string = postgres.outputs.host
output databaseName string = postgres.outputs.databaseName

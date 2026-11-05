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
@description('Repository the VM clones on first boot (its default branch; releases then check out the commit being deployed). A private repository needs a deploy key, see INFRASTRUCTURE.md.')
param repoUrl string = 'https://github.com/ucdavis/rationsmart.git'

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


var compactPrefix = replace(namePrefix, '-', '')
var vmName = '${namePrefix}-vm'
var registryName = take('${compactPrefix}${nameSuffix}', 50)
// A deleted vault keeps its name for 90 days (soft delete) and blocks it with VaultAlreadyExists. The 10-character
// form of this name was used by an earlier test deployment that was deleted, so the suffix is 9 characters here.
var keyVaultName = 'kv-${take(compactPrefix, 8)}-${take(nameSuffix, 9)}'
var postgresName = toLower('${namePrefix}-pg-${take(nameSuffix, 8)}')

module network 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    prefix: namePrefix
    zone: zone
    sshAllowedCidr: sshAllowedCidr
  }
}

module registry 'modules/registry.bicep' = {
  name: 'registry'
  params: {
    name: registryName
    location: location
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

output vmName string = vm.outputs.name
output vmPublicIp string = network.outputs.publicIpAddress
output registryName string = registry.outputs.name
output registryLoginServer string = registry.outputs.loginServer
output keyVaultName string = keyVault.outputs.name
output postgresHost string = postgres.outputs.host
output databaseName string = postgres.outputs.databaseName

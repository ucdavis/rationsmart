// ONE-TIME setup, run by someone who is Owner (or User Access Administrator) on the resource group.
//
//   az deployment group create --resource-group <group> --template-file infra/bootstrap/oidc.bicep \
//     --parameters githubRepo=ucdavis/rationsmart environmentName=stage
//
// Creates two managed identities that GitHub Actions signs in as (no passwords, via OIDC):
//   infra  signed in by the "<env>-infra" GitHub environment. May change resources in this group, and may hand out
//          only the roles listed in the condition below.
//   app    signed in by the "<env>" GitHub environment. Gets no role here: main.bicep gives it AcrPush on the registry
//          and the run-command role on the VM, because those resources do not exist yet.
// and the custom role that allows running commands on a VM (nothing else).

targetScope = 'resourceGroup'

@description('GitHub repository as owner/name.')
param githubRepo string

@description('GitHub environment name for releases. The infrastructure environment is "<name>-infra".')
param environmentName string = 'stage'

param location string = resourceGroup().location
param namePrefix string = 'rationsmart-${environmentName}'

var issuer = 'https://token.actions.githubusercontent.com'
var audience = 'api://AzureADTokenExchange'

// Built-in roles
var contributorId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
var rbacAdministratorId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'f58310d9-a9f6-439a-9e8d-f62e7b41a168')
var acrPullGuid = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var acrPushGuid = '8311e382-0749-4cb8-b61a-304f252e45ec'
var keyVaultSecretsUserGuid = '4633458b-17de-40c2-a5b2-1ac8fb4b3b41'

resource infraIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-infra-gh'
  location: location
}

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-app-gh'
  location: location
}

// A run from another repository, a fork, or a different environment gets no token.
resource infraTrust 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: infraIdentity
  name: 'github-${environmentName}-infra'
  properties: {
    issuer: issuer
    subject: 'repo:${githubRepo}:environment:${environmentName}-infra'
    audiences: [audience]
  }
}

resource appTrust 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: appIdentity
  name: 'github-${environmentName}'
  properties: {
    issuer: issuer
    subject: 'repo:${githubRepo}:environment:${environmentName}'
    audiences: [audience]
  }
}

// Run commands on a VM and read the result, nothing more. Assigned on the one VM by main.bicep.
resource runCommandRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(resourceGroup().id, 'rationsmart-vm-run-command')
  properties: {
    roleName: '${namePrefix} VM run-command'
    description: 'Create, read and delete run commands on a virtual machine.'
    type: 'CustomRole'
    permissions: [
      {
        actions: [
          'Microsoft.Compute/virtualMachines/read'
          'Microsoft.Compute/virtualMachines/runCommands/read'
          'Microsoft.Compute/virtualMachines/runCommands/write'
          'Microsoft.Compute/virtualMachines/runCommands/delete'
        ]
      }
    ]
    assignableScopes: [resourceGroup().id]
  }
}

resource infraContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, infraIdentity.id, contributorId)
  properties: {
    roleDefinitionId: contributorId
    principalId: infraIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// May create and delete role assignments, but only for the four roles below (the condition is checked by Azure).
var allowedRoles = '${acrPullGuid}, ${acrPushGuid}, ${keyVaultSecretsUserGuid}, ${runCommandRole.name}'
var rbacCondition = '((!(ActionMatches{\'Microsoft.Authorization/roleAssignments/write\'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${allowedRoles}})) AND ((!(ActionMatches{\'Microsoft.Authorization/roleAssignments/delete\'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${allowedRoles}}))'

resource infraRoleAdmin 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, infraIdentity.id, rbacAdministratorId)
  properties: {
    roleDefinitionId: rbacAdministratorId
    principalId: infraIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    condition: rbacCondition
    conditionVersion: '2.0'
  }
}

output infraClientId string = infraIdentity.properties.clientId
output appClientId string = appIdentity.properties.clientId
output appPrincipalId string = appIdentity.properties.principalId
output runCommandRoleId string = runCommandRole.id
output tenantId string = tenant().tenantId

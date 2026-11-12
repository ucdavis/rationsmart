// Template for a new environment (for example the client's own tenant): copy to infra/params/<env>.bicepparam
// and change the values marked CHANGE_ME. Nothing secret belongs in this file; secrets come from environment variables.
using '../main.bicep'

// Resource names start with this. Use letters, digits and hyphens, 3 to 30 characters.
param namePrefix = 'CHANGE_ME-env'
param databaseName = 'CHANGE_ME_env'

// Check the size exists in your region and subscription quota: az vm list-skus --location <region> --size Standard_D4as_v6
param vmSize = 'Standard_D4as_v6'
param zone = '1'
param postgresSkuName = 'Standard_B2s'
param postgresSkuTier = 'Burstable'
param postgresVersion = '15'
param postgresStorageGb = 64

// Empty keeps SSH closed (use Entra ID SSH). Or an address range such as '<your-address>/32'.
param sshAllowedCidr = ''

// Only needed if the repository is not the default
// param repoUrl = 'https://github.com/<owner>/<repo>.git'

param adminSshPublicKey = readEnvironmentVariable('ADMIN_SSH_PUBLIC_KEY')
param appIdentityPrincipalId = readEnvironmentVariable('APP_IDENTITY_PRINCIPAL_ID')
param runCommandRoleId = readEnvironmentVariable('RUN_COMMAND_ROLE_ID')
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD')
param jwtSecretKey = readEnvironmentVariable('JWT_SECRET_KEY')
param redisPassword = readEnvironmentVariable('REDIS_PASSWORD')
param smtpPassword = readEnvironmentVariable('SMTP_PASSWORD')

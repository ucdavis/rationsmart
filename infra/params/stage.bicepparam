// rg-rationsmart-stage. Values that are not secret are written here; everything else comes from
// environment variables (the Infrastructure workflow sets them from GitHub environment variables and secrets).
using '../main.bicep'

param namePrefix = 'rationsmart-stage'
param databaseName = 'rationsmart_stage'

// Same sizes as the dev environment
param vmSize = 'Standard_D4as_v6'
param zone = '1'
param postgresSkuName = 'Standard_B2s'
param postgresSkuTier = 'Burstable'
param postgresVersion = '15'
param postgresStorageGb = 64

// SSH stays closed; sign in with Entra ID (az ssh vm). Set an address range here to open port 22 for it.
param sshAllowedCidr = ''

param adminSshPublicKey = readEnvironmentVariable('ADMIN_SSH_PUBLIC_KEY')

// Output of infra/bootstrap/oidc.bicep
param appIdentityPrincipalId = readEnvironmentVariable('APP_IDENTITY_PRINCIPAL_ID')
param runCommandRoleId = readEnvironmentVariable('RUN_COMMAND_ROLE_ID')

// Secrets: hex strings (openssl rand -hex 24), so they need no URL encoding in the database URL
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD')
param jwtSecretKey = readEnvironmentVariable('JWT_SECRET_KEY')
param redisPassword = readEnvironmentVariable('REDIS_PASSWORD')
param smtpPassword = readEnvironmentVariable('SMTP_PASSWORD')

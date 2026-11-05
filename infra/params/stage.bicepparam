// rg-rationsmart-stage. Values that are not secret are written here; everything else comes from
// environment variables (the Infrastructure workflow sets them from GitHub environment variables and secrets).
using '../main.bicep'

param namePrefix = 'rationsmart-stage'
param databaseName = 'rationsmart_stage'

// Region of every resource. The resource group itself is in eastus, but PostgreSQL Flexible Server is not
// available there for this subscription (list-skus returns nothing), so the resources go to eastus2.
param location = 'eastus2'

// VM size as in the dev environment. The database is GeneralPurpose, not the dev environment's Burstable B2s: in this
// subscription the Burstable tier fails with SkuNotAvailable in eastus and eastus2 (tested in every zone), while
// Standard_D2ds_v5 in eastus2 was created successfully. Go back to 'Burstable' / 'Standard_B2s' where it is allowed.
param vmSize = 'Standard_D4as_v6'
param zone = '1'
param postgresSkuName = 'Standard_D2ds_v5'
param postgresSkuTier = 'GeneralPurpose'
param postgresVersion = '15'
param postgresStorageGb = 64

// SSH stays closed; sign in with Entra ID (az ssh vm). Set an address range here to open port 22 for it.
param sshAllowedCidr = ''

// The repository the VM clones: the Infrastructure workflow sets REPO_URL to the repository it runs in.
param repoUrl = readEnvironmentVariable('REPO_URL', 'https://github.com/ucdavis/rationsmart.git')

param adminSshPublicKey = readEnvironmentVariable('ADMIN_SSH_PUBLIC_KEY')

// Output of infra/bootstrap/oidc.bicep
param appIdentityPrincipalId = readEnvironmentVariable('APP_IDENTITY_PRINCIPAL_ID')
param runCommandRoleId = readEnvironmentVariable('RUN_COMMAND_ROLE_ID')

// Secrets: hex strings (openssl rand -hex 24), so they need no URL encoding in the database URL
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD')
param jwtSecretKey = readEnvironmentVariable('JWT_SECRET_KEY')
param redisPassword = readEnvironmentVariable('REDIS_PASSWORD')
param smtpPassword = readEnvironmentVariable('SMTP_PASSWORD')

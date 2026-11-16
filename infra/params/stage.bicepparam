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
// Zone 1 is restricted for Standard_D4as_v6 in this subscription (the Bootstrap workflow, mode preflight, lists the usable
// zones: 2, 3 and 4). The database has no zone: Standard_D2ds_v5 offers none to choose from here.
param zone = '2'
param postgresSkuName = 'Standard_D2ds_v5'
param postgresSkuTier = 'GeneralPurpose'
param postgresVersion = '15'
param postgresStorageGb = 64

// Preserve developer SSH access and restrict web traffic to Cloudflare.
param sshAllowedCidrs = ['106.51.85.143/32', '122.179.11.194/32']

// Cloudflare IPv4 ranges for this IPv4-only origin; checked 2026-11-16.
// https://www.cloudflare.com/ips/ -- keep the VM's Nginx trusted proxies in sync.
var cloudflareCidrs = [
  '173.245.48.0/20'
  '103.21.244.0/22'
  '103.22.200.0/22'
  '103.31.4.0/22'
  '141.101.64.0/18'
  '108.162.192.0/18'
  '190.93.240.0/20'
  '188.114.96.0/20'
  '197.234.240.0/22'
  '198.41.128.0/17'
  '162.158.0.0/15'
  '104.16.0.0/13'
  '104.24.0.0/14'
  '172.64.0.0/13'
  '131.0.72.0/22'
]
param httpAllowedCidrs = cloudflareCidrs
param httpsAllowedCidrs = cloudflareCidrs

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

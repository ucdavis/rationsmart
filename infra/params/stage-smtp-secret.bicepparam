// Parameters of infra/keyvault-smtp-secret.bicep. Both values come from environment variables set by the
// SMTP secret workflow (the vault name from its input, the password from the SMTP_PASSWORD secret).
using '../keyvault-smtp-secret.bicep'

// The empty default is for the Infrastructure workflow, which compiles every file in this folder without setting
// KEY_VAULT_NAME; the SMTP secret workflow refuses an empty or invalid name before it calls Azure.
param keyVaultName = readEnvironmentVariable('KEY_VAULT_NAME', '')
param smtpPassword = readEnvironmentVariable('SMTP_PASSWORD')

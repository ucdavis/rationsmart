// Updates the smtp-password secret of the existing Key Vault and nothing else: the vault is only referenced
// (existing), so no property of it, no other secret and no other resource is part of this deployment.
// Run by .github/workflows/infra-smtp-secret.yml. A changed value becomes a new version of the secret;
// the VM reads the latest version on the next app release (deploy/vm-deploy.sh).

param keyVaultName string

@secure()
@minLength(1)
param smtpPassword string

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource smtpSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'smtp-password'
  properties: { value: smtpPassword }
}

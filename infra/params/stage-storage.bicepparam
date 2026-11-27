// Parameters of infra/storage-reports.bicep. The VM's principal ID comes from the VM_PRINCIPAL_ID variable, which the
// storage workflow sets after it reads it from the VM named in its vm_name input (az vm show).
using '../storage-reports.bicep'

// The empty default is for the Infrastructure workflow, which compiles every file in this folder without setting
// VM_PRINCIPAL_ID; the storage workflow refuses an empty or malformed value before it calls the what-if.
param vmPrincipalId = readEnvironmentVariable('VM_PRINCIPAL_ID', '')
param location = 'eastus2'

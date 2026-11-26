// Parameters of infra/storage-reports.bicep. The VM name comes from the VM_NAME variable (set by the storage workflow
// from the stage-infra environment variable of the same name).
using '../storage-reports.bicep'

// The empty default is for the Infrastructure workflow, which compiles every file in this folder without setting
// VM_NAME; the storage workflow refuses an empty name before it calls Azure.
param vmName = readEnvironmentVariable('VM_NAME', '')
param location = 'eastus2'

// The application VM: Ubuntu 24.04, Trusted Launch, SSH key only, system-assigned identity, Entra ID SSH login.
// Docker, git and the Azure CLI are installed on first boot by cloud-init.yaml.

param name string
param location string
param zone string
param vmSize string
param adminUsername string = 'ubuntu'
param adminSshPublicKey string
param nicId string
param repoUrl string
param repoBranch string

var cloudInit = replace(replace(loadTextContent('../cloud-init.yaml'), '__REPO_URL__', repoUrl), '__REPO_BRANCH__', repoBranch)

resource vm 'Microsoft.Compute/virtualMachines@2024-07-01' = {
  name: name
  location: location
  zones: [zone]
  identity: { type: 'SystemAssigned' }
  properties: {
    hardwareProfile: { vmSize: vmSize }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: 'ubuntu-24_04-lts'
        sku: 'server'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        managedDisk: { storageAccountType: 'Premium_LRS' }
      }
    }
    osProfile: {
      computerName: name
      adminUsername: adminUsername
      customData: base64(cloudInit)
      linuxConfiguration: {
        disablePasswordAuthentication: true
        provisionVMAgent: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${adminUsername}/.ssh/authorized_keys'
              keyData: adminSshPublicKey
            }
          ]
        }
      }
    }
    securityProfile: {
      securityType: 'TrustedLaunch'
      uefiSettings: { secureBootEnabled: true, vTpmEnabled: true }
    }
    networkProfile: {
      networkInterfaces: [{ id: nicId }]
    }
    diagnosticsProfile: {
      bootDiagnostics: { enabled: true }
    }
  }
}

// Lets people with the "Virtual Machine Administrator Login" role sign in over SSH with their Entra ID account.
resource entraSsh 'Microsoft.Compute/virtualMachines/extensions@2024-07-01' = {
  parent: vm
  name: 'AADSSHLoginForLinux'
  location: location
  properties: {
    publisher: 'Microsoft.Azure.ActiveDirectory'
    type: 'AADSSHLoginForLinux'
    typeHandlerVersion: '1.0'
    autoUpgradeMinorVersion: true
  }
}

output name string = vm.name
output principalId string = vm.identity.principalId

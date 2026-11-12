// Network for the VM: virtual network and subnet, a static public IP, the network security group and the
// network interface the group is attached to (as in the dev environment: the NSG sits on the NIC, the subnet has none).

param location string
param prefix string
param zone string

@description('Address range allowed to reach SSH (port 22), for example <your-address>/32. Empty keeps SSH closed.')
param sshAllowedCidr string = ''

var httpRule = [
  {
    name: 'HTTP-port'
    properties: {
      priority: 330
      direction: 'Inbound'
      access: 'Allow'
      protocol: 'Tcp'
      sourceAddressPrefix: 'Internet'
      sourcePortRange: '*'
      destinationAddressPrefix: '*'
      destinationPortRange: '80'
    }
  }
]

var sshRule = [
  {
    name: 'SSH'
    properties: {
      priority: 300
      direction: 'Inbound'
      access: 'Allow'
      protocol: 'Tcp'
      sourceAddressPrefix: sshAllowedCidr
      sourcePortRange: '*'
      destinationAddressPrefix: '*'
      destinationPortRange: '22'
    }
  }
]

resource publicIp 'Microsoft.Network/publicIPAddresses@2024-05-01' = {
  name: '${prefix}-ip'
  location: location
  sku: { name: 'Standard' }
  zones: [zone]
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource nsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: '${prefix}-nsg'
  location: location
  properties: {
    securityRules: concat(httpRule, empty(sshAllowedCidr) ? [] : sshRule)
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${prefix}-vnet'
  location: location
  properties: {
    addressSpace: { addressPrefixes: ['172.16.0.0/16'] }
    subnets: [
      {
        name: 'snet-vm'
        properties: { addressPrefix: '172.16.0.0/24' }
      }
    ]
  }
}

resource nic 'Microsoft.Network/networkInterfaces@2024-05-01' = {
  name: '${prefix}-nic'
  location: location
  properties: {
    networkSecurityGroup: { id: nsg.id }
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          subnet: { id: vnet.properties.subnets[0].id }
          publicIPAddress: { id: publicIp.id }
        }
      }
    ]
  }
}

output nicId string = nic.id
output publicIpAddress string = publicIp.properties.ipAddress

// Network for the VM: virtual network with a VM subnet and a PostgreSQL subnet, a static public IP, the network security group and the
// network interface the group is attached to (as in the dev environment: the NSG sits on the NIC, the subnet has none).

param location string
param prefix string
param zone string

@description('Address range allowed to reach SSH (port 22), for example <your-address>/32. Empty keeps SSH closed.')
param sshAllowedCidr string = ''

@description('SSH source ranges; takes precedence over sshAllowedCidr when nonempty.')
param sshAllowedCidrs array = []

@description('HTTP source ranges. Use Cloudflare ranges for a proxied origin.')
param httpAllowedCidrs array = ['Internet']

@description('HTTPS source ranges. Empty leaves port 443 closed.')
param httpsAllowedCidrs array = []

var sshSources = !empty(sshAllowedCidrs) ? sshAllowedCidrs : (empty(sshAllowedCidr) ? [] : [sshAllowedCidr])

var httpRule = [
  {
    name: 'HTTP-port'
    properties: {
      priority: 330
      direction: 'Inbound'
      access: 'Allow'
      protocol: 'Tcp'
      ...(length(httpAllowedCidrs) == 1 ? { sourceAddressPrefix: httpAllowedCidrs[0] } : { sourceAddressPrefixes: httpAllowedCidrs })
      sourcePortRange: '*'
      destinationAddressPrefix: '*'
      destinationPortRange: '80'
    }
  }
]

var sshRule = [
  {
    name: 'SSH-developers'
    properties: {
      priority: 320
      direction: 'Inbound'
      access: 'Allow'
      protocol: 'Tcp'
      sourceAddressPrefixes: sshSources
      sourcePortRange: '*'
      destinationAddressPrefix: '*'
      destinationPortRange: '22'
    }
  }
]

var httpsRule = [
  {
    name: 'HTTPS-Cloudflare'
    properties: {
      priority: 340
      direction: 'Inbound'
      access: 'Allow'
      protocol: 'Tcp'
      sourceAddressPrefixes: httpsAllowedCidrs
      sourcePortRange: '*'
      destinationAddressPrefix: '*'
      destinationPortRange: '443'
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
    securityRules: concat(empty(httpAllowedCidrs) ? [] : httpRule, empty(sshSources) ? [] : sshRule, empty(httpsAllowedCidrs) ? [] : httpsRule)
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
      // Only the private PostgreSQL server lives here (VNet integration needs a subnet delegated to the service).
      {
        name: 'snet-postgres'
        properties: {
          addressPrefix: '172.16.1.0/24'
          delegations: [
            {
              name: 'postgres'
              properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' }
            }
          ]
        }
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
output vnetId string = vnet.id
output postgresSubnetId string = vnet.properties.subnets[1].id
output publicIpAddress string = publicIp.properties.ipAddress

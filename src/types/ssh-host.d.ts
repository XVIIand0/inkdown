interface ISshHostAddress {
  id: string
  label?: string
  hostname: string
  port: number
}

interface ISshHost {
  id: string
  name: string
  hostname: string
  port: number
  username: string
  authMethod: 'key' | 'password' | 'agent'
  identityFile?: string
  password?: string
  iconType: 'default' | 'color' | 'image' | 'emoji'
  iconValue?: string
  sort: number
  created: number
  updated: number
  addresses?: ISshHostAddress[]
  activeAddressId?: string
  borderColor?: string
}

interface ISshTestResult {
  success: boolean
  error?: string
  latencyMs?: number
}

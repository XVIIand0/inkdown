interface ISshHost {
  id: string
  name: string
  hostname: string
  port: number
  username: string
  authMethod: 'key' | 'password' | 'agent'
  identityFile?: string
  password?: string
  iconType: 'default' | 'color' | 'image'
  iconValue?: string
  sort: number
  created: number
  updated: number
}

interface ISshTestResult {
  success: boolean
  error?: string
  latencyMs?: number
}

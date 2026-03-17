interface IClaudeProject {
  id: string
  name: string
  path: string
  candidatePaths?: string[]
  sessionCount: number
  hasMemory: boolean
  hostId?: string
}

interface IClaudeSession {
  id: string
  firstMessage: string
  lastTimestamp: number
  messageCount: number
  customName?: string
}

interface IClaudeMessage {
  uuid: string
  type: 'user' | 'assistant'
  content: string
  timestamp: number
  model?: string
  tokens?: number
}

interface IClaudeFileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: IClaudeFileNode[]
}

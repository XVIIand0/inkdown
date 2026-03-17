interface IClaudeProject {
  id: string
  name: string
  path: string
  sessionCount: number
  hasMemory: boolean
}

interface IClaudeSession {
  id: string
  firstMessage: string
  lastTimestamp: number
  messageCount: number
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

export type CenterTabType = 'session' | 'mind-note' | 'code-file' | 'ssh-terminal'

export interface CenterTab {
  id: string
  type: CenterTabType
  title: string
  sessionId?: string
  projectId?: string
  noteId?: string
  filePath?: string
  language?: string
  dirty?: boolean
  attention?: boolean
  hostId?: string
}

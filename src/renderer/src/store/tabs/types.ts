export type CenterTabType = 'session' | 'mind-note' | 'code-file' | 'ssh-terminal' | 'local-terminal'

export interface CenterTab {
  id: string
  type: CenterTabType
  title: string
  sessionId?: string
  projectId?: string
  noteId?: string
  filePath?: string
  initialCommand?: string
  language?: string
  dirty?: boolean
  attention?: boolean
  hostId?: string
  borderColor?: string
}

export type SplitDirection = 'horizontal' | 'vertical'

export interface LayoutSplitNode {
  type: 'split'
  id: string
  direction: SplitDirection
  children: LayoutNode[]
  sizes: number[]
}

export interface LayoutTabGroup {
  type: 'tab-group'
  id: string
  tabIds: string[]
  activeTabId: string | null
}

export type LayoutNode = LayoutSplitNode | LayoutTabGroup

export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center'

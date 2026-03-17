import { computed, makeObservable } from 'mobx'
import { StructStore } from '../struct'
import { Store } from '../store'
import { CenterTab } from './types'

const state = {
  tabs: [] as CenterTab[],
  activeTabId: null as string | null
}

export class CenterTabStore extends StructStore<typeof state> {
  constructor(private readonly store: Store) {
    super(state)
    makeObservable(this, {
      activeTab: computed
    })
  }

  get activeTab(): CenterTab | null {
    if (!this.state.activeTabId) return null
    return this.state.tabs.find((t) => t.id === this.state.activeTabId) || null
  }

  openSessionTab(projectId: string | null, sessionId: string, title: string) {
    const existing = this.state.tabs.find(
      (t) => t.type === 'session' && t.sessionId === sessionId
    )
    if (existing) {
      this.setState({ activeTabId: existing.id })
      return
    }
    const tab: CenterTab = {
      id: crypto.randomUUID(),
      type: 'session',
      title,
      sessionId,
      projectId: projectId || undefined
    }
    this.setState((s) => {
      s.tabs.push(tab)
      s.activeTabId = tab.id
    })
  }

  openMindNoteTab(noteId: string, title: string) {
    const existing = this.state.tabs.find(
      (t) => t.type === 'mind-note' && t.noteId === noteId
    )
    if (existing) {
      this.setState({ activeTabId: existing.id })
      return
    }
    const tab: CenterTab = {
      id: crypto.randomUUID(),
      type: 'mind-note',
      title,
      noteId
    }
    this.setState((s) => {
      s.tabs.push(tab)
      s.activeTabId = tab.id
    })
  }

  openCodeFileTab(filePath: string) {
    const existing = this.state.tabs.find(
      (t) => t.type === 'code-file' && t.filePath === filePath
    )
    if (existing) {
      this.setState({ activeTabId: existing.id })
      return
    }
    const parts = filePath.replace(/\\/g, '/').split('/')
    const filename = parts[parts.length - 1] || filePath
    const tab: CenterTab = {
      id: crypto.randomUUID(),
      type: 'code-file',
      title: filename,
      filePath,
      dirty: false
    }
    this.setState((s) => {
      s.tabs.push(tab)
      s.activeTabId = tab.id
    })
  }

  closeTab(id: string) {
    const index = this.state.tabs.findIndex((t) => t.id === id)
    if (index < 0) return
    const wasActive = this.state.activeTabId === id
    this.setState((s) => {
      s.tabs.splice(index, 1)
      if (wasActive) {
        if (s.tabs.length === 0) {
          s.activeTabId = null
        } else if (index < s.tabs.length) {
          s.activeTabId = s.tabs[index].id
        } else {
          s.activeTabId = s.tabs[s.tabs.length - 1].id
        }
      }
    })
  }

  closeOtherTabs(keepId: string) {
    this.setState((s) => {
      s.tabs = s.tabs.filter((t) => t.id === keepId)
      s.activeTabId = keepId
    })
  }

  closeTabsToTheRight(id: string) {
    const index = this.state.tabs.findIndex((t) => t.id === id)
    if (index < 0) return
    this.setState((s) => {
      s.tabs = s.tabs.slice(0, index + 1)
      if (s.activeTabId && !s.tabs.find((t) => t.id === s.activeTabId)) {
        s.activeTabId = id
      }
    })
  }

  closeAllTabs() {
    this.setState({ tabs: [], activeTabId: null })
  }

  selectTab(id: string) {
    this.setState({ activeTabId: id })
  }

  moveTab(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    this.setState((s) => {
      const [tab] = s.tabs.splice(fromIndex, 1)
      const target = fromIndex < toIndex ? toIndex - 1 : toIndex
      s.tabs.splice(target, 0, tab)
    })
  }

  updateTabTitle(id: string, title: string) {
    this.setState((s) => {
      const tab = s.tabs.find((t) => t.id === id)
      if (tab) tab.title = title
    })
  }

  setTabAttention(id: string, attention: boolean) {
    this.setState((s) => {
      const tab = s.tabs.find((t) => t.id === id)
      if (tab) tab.attention = attention
    })
  }

  setTabAttentionBySessionId(sessionId: string, attention: boolean) {
    this.setState((s) => {
      const tab = s.tabs.find((t) => t.type === 'session' && t.sessionId === sessionId)
      if (tab) tab.attention = attention
    })
  }
}

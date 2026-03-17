import { Store } from './store'
import { StructStore } from './struct'
import { observable, runInAction } from 'mobx'

const ipcRenderer = window.electron.ipcRenderer

const PAGE_SIZE = 50

interface ISearchMatch {
  type: string
  content: string
  timestamp: number
}

interface ISearchResult {
  projectId: string
  projectPath: string
  sessionId: string
  matches: ISearchMatch[]
}

const state = {
  projects: [] as IClaudeProject[],
  activeProjectId: null as string | null,
  sessions: [] as IClaudeSession[],
  activeSessionId: null as string | null,
  messages: [] as IClaudeMessage[],
  viewMode: 'sessions' as 'files' | 'sessions',
  fileTree: [] as IClaudeFileNode[],
  loading: false,
  messagesLoading: false,
  hasMoreMessages: false,
  currentOffset: 0,
  searchQuery: '',
  searchResults: [] as ISearchResult[],
  searchLoading: false
}

const dialogData = {
  showImportDialog: false,
  allProjects: [] as IClaudeProject[],
  selectedIds: [] as string[],
  scanning: false
}

export class ClaudeCodeStore extends StructStore<typeof state> {
  dialog = observable(dialogData)
  constructor(private readonly store: Store) {
    super(state)
  }

  setDialog(ctx: Partial<typeof dialogData> | ((d: typeof dialogData) => void)) {
    runInAction(() => {
      if (ctx instanceof Function) {
        ctx(this.dialog)
      } else {
        Object.keys(ctx).forEach((key) => {
          ;(this.dialog as any)[key] = (ctx as any)[key]
        })
      }
    })
  }

  async loadProjects() {
    const importedIds = this.store.settings.state.claudeCodeImportedProjects
    if (!importedIds || importedIds.length === 0) {
      this.setState({ projects: [] })
      return
    }
    this.setState({ loading: true })
    try {
      const all: IClaudeProject[] = await ipcRenderer.invoke('claude-code:getProjects')
      const filtered = (all || []).filter((p) => importedIds.includes(p.id))
      this.setState({ projects: filtered })
    } catch (e) {
      console.error('Failed to load Claude Code projects', e)
      this.setState({ projects: [] })
    } finally {
      this.setState({ loading: false })
    }
  }

  async scanAndShowImportDialog() {
    this.setDialog({ scanning: true, showImportDialog: true, selectedIds: [] })
    try {
      const all: IClaudeProject[] = await ipcRenderer.invoke('claude-code:getProjects')
      const importedIds = this.store.settings.state.claudeCodeImportedProjects || []
      this.setDialog({
        allProjects: all || [],
        selectedIds: importedIds.length > 0
          ? importedIds.filter((id: string) => (all || []).some((p) => p.id === id))
          : (all || []).map((p) => p.id),
        scanning: false
      })
    } catch (e) {
      console.error('Failed to scan projects', e)
      this.setDialog({ allProjects: [], scanning: false })
    }
  }

  async confirmImport() {
    const ids = [...this.dialog.selectedIds]
    await this.store.settings.setSetting('claudeCodeImportedProjects', ids)
    this.setDialog({ showImportDialog: false })
    await this.loadProjects()
  }

  closeImportDialog() {
    this.setDialog({ showImportDialog: false })
  }

  toggleImportSelection(id: string) {
    this.setDialog((d) => {
      const idx = d.selectedIds.indexOf(id)
      if (idx >= 0) {
        d.selectedIds.splice(idx, 1)
      } else {
        d.selectedIds.push(id)
      }
    })
  }

  toggleSelectAll() {
    this.setDialog((d) => {
      if (d.selectedIds.length === d.allProjects.length) {
        d.selectedIds = []
      } else {
        d.selectedIds = d.allProjects.map((p) => p.id)
      }
    })
  }

  async enterClaudeCodeMode() {
    await this.store.settings.setSetting('claudeCodeMode', true)
    const importedIds = this.store.settings.state.claudeCodeImportedProjects
    if (!importedIds || importedIds.length === 0) {
      await this.scanAndShowImportDialog()
    } else {
      await this.loadProjects()
    }
  }

  async selectProject(id: string) {
    this.setState({
      activeProjectId: id,
      sessions: [],
      activeSessionId: null,
      messages: [],
      currentOffset: 0,
      hasMoreMessages: false,
      fileTree: []
    })
    this.setState({ loading: true })
    try {
      const sessions = await ipcRenderer.invoke('claude-code:getSessions', id)
      this.setState({ sessions: sessions || [] })
      if (this.state.viewMode === 'files') {
        await this.loadFileTree()
      }
    } catch (e) {
      console.error('Failed to load sessions for project', e)
      this.setState({ sessions: [] })
    } finally {
      this.setState({ loading: false })
    }
  }

  async selectSession(id: string) {
    this.setState({
      activeSessionId: id,
      messages: [],
      currentOffset: 0,
      hasMoreMessages: false
    })
    this.setState({ messagesLoading: true })
    try {
      const messages = await ipcRenderer.invoke(
        'claude-code:getSessionMessages',
        this.state.activeProjectId,
        id,
        0,
        PAGE_SIZE
      )
      this.setState({
        messages: messages || [],
        hasMoreMessages: (messages?.length || 0) >= PAGE_SIZE,
        currentOffset: PAGE_SIZE
      })
    } catch (e) {
      console.error('Failed to load messages for session', e)
      this.setState({ messages: [] })
    } finally {
      this.setState({ messagesLoading: false })
    }
  }

  async loadMoreMessages() {
    if (this.state.messagesLoading || !this.state.hasMoreMessages) return
    this.setState({ messagesLoading: true })
    try {
      const newMessages = await ipcRenderer.invoke(
        'claude-code:getSessionMessages',
        this.state.activeProjectId,
        this.state.activeSessionId,
        this.state.currentOffset,
        PAGE_SIZE
      ) || []
      this.setState((s) => {
        s.messages = [...s.messages, ...newMessages]
        s.hasMoreMessages = newMessages.length >= PAGE_SIZE
        s.currentOffset = s.currentOffset + PAGE_SIZE
      })
    } catch (e) {
      console.error('Failed to load more messages', e)
    } finally {
      this.setState({ messagesLoading: false })
    }
  }

  toggleViewMode() {
    const newMode = this.state.viewMode === 'sessions' ? 'files' : 'sessions'
    this.setState({ viewMode: newMode })
    if (newMode === 'files' && this.state.activeProjectId) {
      this.loadFileTree()
    }
  }

  async loadFileTree() {
    const project = this.activeProject
    if (!project) return
    this.setState({ loading: true })
    try {
      const tree = await ipcRenderer.invoke('claude-code:getProjectFiles', project.path)
      this.setState({ fileTree: tree || [] })
    } catch (e) {
      console.error('Failed to load file tree', e)
      this.setState({ fileTree: [] })
    } finally {
      this.setState({ loading: false })
    }
  }

  async searchAllSessions(query: string) {
    if (!query.trim()) {
      this.clearSearch()
      return
    }
    this.setState({ searchQuery: query, searchLoading: true, searchResults: [] })
    try {
      const results: ISearchResult[] = await ipcRenderer.invoke(
        'claude-code:searchAllSessions',
        query
      )
      this.setState({ searchResults: results || [], searchLoading: false })
    } catch (e) {
      console.error('Failed to search sessions', e)
      this.setState({ searchResults: [], searchLoading: false })
    }
  }

  clearSearch() {
    this.setState({ searchQuery: '', searchResults: [], searchLoading: false })
  }

  get activeProject(): IClaudeProject | null {
    return this.state.projects.find((p) => p.id === this.state.activeProjectId) || null
  }
}

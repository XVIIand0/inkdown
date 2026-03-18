import { Store } from './store'
import { StructStore } from './struct'
import { computed, makeObservable, observable, runInAction } from 'mobx'

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
  activeHostId: null as string | null,
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
  searchLoading: false,
  sessionAliases: {} as Record<string, string>,
  pinnedSessionIds: [] as string[],
  projectConfigs: {} as Record<string, { iconType: string; iconValue?: string; sort: number; displayName?: string }>,
  showFileFinder: false,
  recentFiles: [] as Array<{ rel: string; abs: string; projectId: string; timestamp: number }>
}

const dialogData = {
  showImportDialog: false,
  allProjects: [] as IClaudeProject[],
  selectedIds: [] as string[],
  scanning: false,
  manageHostId: null as string | null,
  manageHostName: '' as string,
  displayNames: {} as Record<string, string>
}

export class ClaudeCodeStore extends StructStore<typeof state> {
  dialog = observable(dialogData)
  constructor(private readonly store: Store) {
    super(state)
    makeObservable(this, {
      activeProject: computed,
      groupedProjects: computed
    })
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
    const imported = this.store.settings.state.claudeCodeImportedProjects
    let localIds: string[] = []
    if (Array.isArray(imported)) {
      localIds = imported
    } else if (imported && typeof imported === 'object') {
      localIds = (imported as any).local || []
    }
    if (localIds.length === 0) {
      this.setState({ projects: [] })
      return
    }
    this.setState({ loading: true })
    try {
      const [all, configs] = await Promise.all([
        ipcRenderer.invoke('claude-code:getProjects') as Promise<IClaudeProject[]>,
        ipcRenderer.invoke('claude-code:getProjectConfigs')
      ])
      const filtered = (all || []).filter((p) => localIds.includes(p.id))
      this.setState({ projects: filtered, projectConfigs: configs || {} })
    } catch (e) {
      console.error('Failed to load Claude Code projects', e)
      this.setState({ projects: [] })
    } finally {
      this.setState({ loading: false })
    }
  }

  async openManageProjectsDialog(hostId: string | null) {
    let hostName = 'Local'
    if (hostId) {
      const host = this.store.sshHost.state.hosts.find((h: ISshHost) => h.id === hostId)
      hostName = host?.name || host?.hostname || hostId
    }
    this.setDialog({
      scanning: true,
      showImportDialog: true,
      selectedIds: [],
      manageHostId: hostId,
      manageHostName: hostName,
      displayNames: {}
    })
    try {
      let all: IClaudeProject[]
      if (hostId) {
        all = await ipcRenderer.invoke('ssh-host:getRemoteProjects', hostId)
      } else {
        all = await ipcRenderer.invoke('claude-code:getProjects')
      }
      const imported = this.store.settings.state.claudeCodeImportedProjects || {}
      const key = hostId || 'local'
      const existingIds =
        Array.isArray(imported)
          ? (hostId ? [] : imported)
          : typeof imported === 'object'
            ? (imported as any)[key] || []
            : []
      // Load existing display names from projectConfigs
      const configs = this.state.projectConfigs
      const displayNames: Record<string, string> = {}
      for (const p of (all || [])) {
        if (configs[p.id]?.displayName) {
          displayNames[p.id] = configs[p.id].displayName!
        }
      }
      this.setDialog({
        allProjects: all || [],
        selectedIds:
          existingIds.length > 0
            ? existingIds.filter((id: string) => (all || []).some((p) => p.id === id))
            : (all || []).map((p) => p.id),
        scanning: false,
        displayNames
      })
    } catch (e) {
      console.error('Failed to scan projects', e)
      this.setDialog({ allProjects: [], scanning: false })
    }
  }

  async confirmManageProjects() {
    const hostId = this.dialog.manageHostId
    const ids = [...this.dialog.selectedIds]
    const imported = this.store.settings.state.claudeCodeImportedProjects
    const obj =
      typeof imported === 'object' && !Array.isArray(imported) ? { ...imported } : {}
    const key = hostId || 'local'
    obj[key] = ids
    await this.store.settings.setSetting('claudeCodeImportedProjects', obj)
    // Save display names
    const displayNames = this.dialog.displayNames
    for (const [projectId, name] of Object.entries(displayNames)) {
      await ipcRenderer.invoke('claude-code:setProjectConfig', {
        projectId,
        hostId,
        displayName: name
      })
      runInAction(() => {
        const existing = this.state.projectConfigs[projectId] || { iconType: 'default', sort: 0 }
        this.state.projectConfigs[projectId] = { ...existing, displayName: name || undefined }
      })
    }
    this.setDialog({ showImportDialog: false })
    // Reload configs then projects
    try {
      const configs = await ipcRenderer.invoke('claude-code:getProjectConfigs')
      this.setState({ projectConfigs: configs || {} })
    } catch {}
    await this.loadProjects()
  }

  closeManageDialog() {
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

  setDisplayName(projectId: string, name: string) {
    this.setDialog((d) => {
      d.displayNames[projectId] = name
    })
  }

  async enterClaudeCodeMode() {
    await this.store.settings.setSetting('claudeCodeMode', true)
    const imported = this.store.settings.state.claudeCodeImportedProjects
    let hasProjects = false
    if (Array.isArray(imported)) {
      hasProjects = imported.length > 0
    } else if (imported && typeof imported === 'object') {
      const localIds = (imported as any).local || []
      hasProjects = localIds.length > 0
    }
    if (!hasProjects) {
      await this.openManageProjectsDialog(null)
    } else {
      await this.loadProjects()
    }
    this.loadRecentFiles()
    this.store.centerTabs.restoreLayout()
  }

  async selectProject(id: string, hostId?: string | null) {
    this.setState({
      activeProjectId: id,
      activeHostId: hostId || null,
      sessions: [],
      activeSessionId: null,
      messages: [],
      currentOffset: 0,
      hasMoreMessages: false,
      fileTree: []
    })
    this.setState({ loading: true })
    try {
      let sessions: IClaudeSession[]
      if (hostId) {
        sessions = await ipcRenderer.invoke('ssh-host:getRemoteSessions', hostId, id)
      } else {
        sessions = await ipcRenderer.invoke('claude-code:getSessions', id)
      }
      // Load custom aliases and pins for this project
      const [aliases, pins] = await Promise.all([
        ipcRenderer.invoke('claude-code:getSessionAliases', id, hostId || null),
        ipcRenderer.invoke('claude-code:getSessionPins', id, hostId || null)
      ])
      this.setState({
        sessions: sessions || [],
        sessionAliases: aliases || {},
        pinnedSessionIds: pins || []
      })
      if (this.state.viewMode === 'files' && !hostId) {
        await this.loadFileTree()
      }
    } catch (e) {
      console.error('Failed to load sessions for project', e)
      this.setState({ sessions: [] })
    } finally {
      this.setState({ loading: false })
    }
  }

  async refreshSessions() {
    const id = this.state.activeProjectId
    if (!id) return
    const hostId = this.state.activeHostId
    try {
      let sessions: IClaudeSession[]
      if (hostId) {
        sessions = await ipcRenderer.invoke('ssh-host:getRemoteSessions', hostId, id)
      } else {
        sessions = await ipcRenderer.invoke('claude-code:getSessions', id)
      }
      this.setState({ sessions: sessions || [] })
    } catch {
      // Silently fail — this is a background refresh
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

  async renameSession(sessionId: string, alias: string) {
    const projectId = this.state.activeProjectId
    if (!projectId) return
    await ipcRenderer.invoke('claude-code:setSessionAlias', {
      projectId,
      sessionId,
      alias,
      hostId: this.state.activeHostId || null
    })
    this.setState((s) => {
      if (alias.trim()) {
        s.sessionAliases[sessionId] = alias.trim()
      } else {
        delete s.sessionAliases[sessionId]
      }
    })
    // Also update the tab title if this session is open
    const displayName = alias.trim() || this.state.sessions.find(
      (s: IClaudeSession) => s.id === sessionId
    )?.firstMessage || 'Session'
    const tabs = this.store.centerTabs.state.tabs
    const tab = tabs.find((t) => t.type === 'session' && t.sessionId === sessionId)
    if (tab) {
      this.store.centerTabs.updateTabTitle(tab.id, displayName)
    }
  }

  getSessionDisplayName(session: IClaudeSession): string {
    return this.state.sessionAliases[session.id] || session.firstMessage || 'Untitled'
  }

  isSessionPinned(sessionId: string): boolean {
    return this.state.pinnedSessionIds.includes(sessionId)
  }

  async toggleSessionPin(sessionId: string) {
    const projectId = this.state.activeProjectId
    if (!projectId) return
    const isPinned = await ipcRenderer.invoke('claude-code:toggleSessionPin', {
      projectId,
      sessionId,
      hostId: this.state.activeHostId || null
    })
    this.setState((s) => {
      if (isPinned) {
        if (!s.pinnedSessionIds.includes(sessionId)) {
          s.pinnedSessionIds.push(sessionId)
        }
      } else {
        s.pinnedSessionIds = s.pinnedSessionIds.filter((id) => id !== sessionId)
      }
    })
  }

  getProjectConfig(projectId: string) {
    return this.state.projectConfigs[projectId] || { iconType: 'default', sort: 0 }
  }

  async setProjectConfig(
    projectId: string,
    updates: { iconType?: string; iconValue?: string; sort?: number; displayName?: string }
  ) {
    const hostId = this.state.activeHostId || null
    await ipcRenderer.invoke('claude-code:setProjectConfig', {
      projectId,
      hostId,
      ...updates
    })
    this.setState((s) => {
      const existing = s.projectConfigs[projectId] || { iconType: 'default', sort: 0 }
      s.projectConfigs[projectId] = { ...existing, ...updates }
    })
  }

  async reorderProjects(hostId: string | null, projectIds: string[]) {
    await ipcRenderer.invoke('claude-code:reorderProjects', { hostId, projectIds })
    this.setState((s) => {
      for (let i = 0; i < projectIds.length; i++) {
        const existing = s.projectConfigs[projectIds[i]]
        if (existing) {
          existing.sort = i
        } else {
          s.projectConfigs[projectIds[i]] = { iconType: 'default', sort: i }
        }
      }
    })
  }

  async startNewConversation() {
    const projectId = this.state.activeProjectId
    if (!projectId) return
    const hostId = this.state.activeHostId
    const newSessionId = `new-${crypto.randomUUID()}`
    // Find the project to get its path
    let projectPath = ''
    if (hostId) {
      for (const group of this.groupedProjects) {
        const found = group.projects.find((p) => p.id === projectId)
        if (found) {
          projectPath = found.path
          break
        }
      }
    } else {
      const project = this.state.projects.find((p) => p.id === projectId)
      if (project) projectPath = project.path
    }
    this.store.centerTabs.openSessionTab(
      projectId,
      newSessionId,
      'New Conversation',
      hostId || undefined
    )
  }

  get groupedProjects(): Array<{
    hostId: string | null
    hostName: string
    iconType: string
    iconValue?: string
    borderColor?: string
    projects: IClaudeProject[]
  }> {
    const groups: Array<{
      hostId: string | null
      hostName: string
      iconType: string
      iconValue?: string
      borderColor?: string
      projects: IClaudeProject[]
    }> = []

    const configs = this.state.projectConfigs
    const sortProjects = (projects: IClaudeProject[]) => {
      return [...projects].sort((a, b) => {
        const sa = configs[a.id]?.sort ?? 999
        const sb = configs[b.id]?.sort ?? 999
        return sa - sb
      })
    }

    // Local group always first
    const localHost = this.store.settings.state.claudeCodeLocalHost
    groups.push({
      hostId: null,
      hostName: localHost?.name || 'Local',
      iconType: localHost?.iconType || 'default',
      iconValue: localHost?.iconValue,
      projects: sortProjects(this.state.projects)
    })

    // SSH host groups
    const hosts = this.store.sshHost.state.hosts
    const imported = this.store.settings.state.claudeCodeImportedProjects
    const importedMap =
      typeof imported === 'object' && !Array.isArray(imported)
        ? (imported as Record<string, string[]>)
        : {}

    for (const host of hosts) {
      const hostProjectIds = importedMap[host.id] || []
      const remoteProjects: IClaudeProject[] = hostProjectIds.map((id: string) => {
        const parts = id.split(/[/\\]/).filter(Boolean)
        const name = parts[parts.length - 1] || id
        return {
          id,
          name,
          path: id,
          sessionCount: 0,
          hasMemory: false,
          hostId: host.id
        }
      })
      groups.push({
        hostId: host.id,
        hostName: host.name,
        iconType: host.iconType,
        iconValue: host.iconValue,
        borderColor: host.borderColor,
        projects: sortProjects(remoteProjects)
      })
    }

    return groups
  }

  openFileFinder() {
    this.setState({ showFileFinder: true })
  }

  closeFileFinder() {
    this.setState({ showFileFinder: false })
  }

  addRecentFile(entry: { rel: string; abs: string; projectId: string }) {
    this.setState((s) => {
      s.recentFiles = s.recentFiles.filter((f) => f.abs !== entry.abs)
      s.recentFiles.unshift({ ...entry, timestamp: Date.now() })
      if (s.recentFiles.length > 50) s.recentFiles = s.recentFiles.slice(0, 50)
    })
    this.store.settings.setSetting('claudeCodeRecentFiles', [...this.state.recentFiles])
  }

  removeRecentFile(abs: string) {
    this.setState((s) => {
      s.recentFiles = s.recentFiles.filter((f) => f.abs !== abs)
    })
    this.store.settings.setSetting('claudeCodeRecentFiles', [...this.state.recentFiles])
  }

  loadRecentFiles() {
    const saved = this.store.settings.state.claudeCodeRecentFiles
    if (Array.isArray(saved)) {
      this.setState({ recentFiles: saved })
    }
  }

  get activeProject(): IClaudeProject | null {
    return this.state.projects.find((p) => p.id === this.state.activeProjectId) || null
  }
}

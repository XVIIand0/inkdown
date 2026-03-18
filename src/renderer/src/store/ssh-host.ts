import { Store } from './store'
import { StructStore } from './struct'
import { observable, runInAction } from 'mobx'

const ipcRenderer = window.electron.ipcRenderer

const state = {
  hosts: [] as ISshHost[],
  expandedHostIds: [] as string[],
  testingHostId: null as string | null,
  testResult: null as ISshTestResult | null
}

const dialogData = {
  showHostDialog: false,
  editingHost: null as ISshHost | null,
  showRemoteImportDialog: false,
  importHostId: null as string | null,
  remoteAllProjects: [] as IClaudeProject[],
  remoteSelectedIds: [] as string[],
  scanning: false
}

export class SshHostStore extends StructStore<typeof state> {
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

  async loadHosts() {
    const hosts: ISshHost[] = await ipcRenderer.invoke('ssh-host:getAll')
    this.setState({ hosts: hosts || [] })
  }

  async createHost(data: Omit<ISshHost, 'id' | 'created' | 'updated'>) {
    await ipcRenderer.invoke('ssh-host:create', data)
    await this.loadHosts()
  }

  async updateHost(id: string, data: Partial<ISshHost>) {
    await ipcRenderer.invoke('ssh-host:update', id, data)
    await this.loadHosts()
  }

  async deleteHost(id: string) {
    await ipcRenderer.invoke('ssh-host:delete', id)
    // Also clean imported projects for this host
    const imported = this.store.settings.state.claudeCodeImportedProjects || {}
    if (typeof imported === 'object' && !Array.isArray(imported) && imported[id]) {
      delete imported[id]
      await this.store.settings.setSetting('claudeCodeImportedProjects', { ...imported })
    }
    await this.loadHosts()
  }

  async testHost(id: string) {
    this.setState({ testingHostId: id, testResult: null })
    try {
      const result: ISshTestResult = await ipcRenderer.invoke('ssh-host:test', id)
      this.setState({ testResult: result, testingHostId: null })
      return result
    } catch (e: any) {
      const result = { success: false, error: e?.message || 'Test failed' }
      this.setState({ testResult: result, testingHostId: null })
      return result
    }
  }

  toggleHostExpanded(hostId: string) {
    this.setState((s) => {
      const idx = s.expandedHostIds.indexOf(hostId)
      if (idx >= 0) {
        s.expandedHostIds.splice(idx, 1)
      } else {
        s.expandedHostIds.push(hostId)
      }
    })
  }

  async scanRemoteProjects(hostId: string) {
    this.setDialog({
      showRemoteImportDialog: true,
      importHostId: hostId,
      scanning: true,
      remoteSelectedIds: [],
      remoteAllProjects: []
    })
    try {
      const projects: IClaudeProject[] = await ipcRenderer.invoke(
        'ssh-host:getRemoteProjects',
        hostId
      )
      const imported = this.store.settings.state.claudeCodeImportedProjects || {}
      const existingIds =
        typeof imported === 'object' && !Array.isArray(imported) ? imported[hostId] || [] : []
      this.setDialog({
        remoteAllProjects: projects || [],
        remoteSelectedIds:
          existingIds.length > 0
            ? existingIds.filter((id: string) => (projects || []).some((p) => p.id === id))
            : (projects || []).map((p) => p.id),
        scanning: false
      })
    } catch (e) {
      console.error('Failed to scan remote projects', e)
      this.setDialog({ remoteAllProjects: [], scanning: false })
    }
  }

  async confirmRemoteImport() {
    const hostId = this.dialog.importHostId
    if (!hostId) return
    const ids = [...this.dialog.remoteSelectedIds]
    const imported = this.store.settings.state.claudeCodeImportedProjects || {}
    const obj =
      typeof imported === 'object' && !Array.isArray(imported)
        ? { ...imported }
        : { local: imported as any }
    obj[hostId] = ids
    await this.store.settings.setSetting('claudeCodeImportedProjects', obj)
    this.setDialog({ showRemoteImportDialog: false })
    await this.store.claudeCode.loadProjects()
  }

  closeRemoteImportDialog() {
    this.setDialog({ showRemoteImportDialog: false })
  }

  toggleRemoteImportSelection(id: string) {
    this.setDialog((d) => {
      const idx = d.remoteSelectedIds.indexOf(id)
      if (idx >= 0) d.remoteSelectedIds.splice(idx, 1)
      else d.remoteSelectedIds.push(id)
    })
  }

  toggleRemoteSelectAll() {
    this.setDialog((d) => {
      if (d.remoteSelectedIds.length === d.remoteAllProjects.length) {
        d.remoteSelectedIds = []
      } else {
        d.remoteSelectedIds = d.remoteAllProjects.map((p) => p.id)
      }
    })
  }

  // Resync a single remote project (reload its sessions)
  async resyncProject(projectId: string, hostId: string) {
    if (
      this.store.claudeCode.state.activeProjectId === projectId &&
      this.store.claudeCode.state.activeHostId === hostId
    ) {
      await this.store.claudeCode.selectProject(projectId, hostId)
    }
  }

  // Resync a host: refresh session data for already-imported projects only
  async resyncHost(hostId: string) {
    this.setState({ testingHostId: hostId })
    try {
      // If currently viewing a project under this host, reload its sessions
      if (this.store.claudeCode.state.activeHostId === hostId) {
        const pid = this.store.claudeCode.state.activeProjectId
        if (pid) {
          await this.store.claudeCode.selectProject(pid, hostId)
        }
      }
    } catch (e) {
      console.error('Failed to resync host', e)
    } finally {
      this.setState({ testingHostId: null })
    }
  }

  openHostDialog(host?: ISshHost) {
    this.setDialog({ showHostDialog: true, editingHost: host || null })
  }

  closeHostDialog() {
    this.setDialog({ showHostDialog: false, editingHost: null })
  }
}

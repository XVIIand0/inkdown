import { Store } from './store'
import { StructStore } from './struct'

const ipcRenderer = window.electron.ipcRenderer

const state = {
  notes: [] as IMindNote[],
  activeScope: 'global' as string,
  activeNoteId: null as string | null,
  scopes: [] as { scope: string; count: number }[],
  loading: false
}

export class MindNoteStore extends StructStore<typeof state> {
  constructor(private readonly store: Store) {
    super(state)
  }

  async loadScopes() {
    const scopes = await ipcRenderer.invoke('mind-note:getScopes')
    this.setState({ scopes: scopes || [] })
  }

  async loadNotes(scope: string) {
    this.setState({ activeScope: scope, loading: true })
    try {
      const notes = await ipcRenderer.invoke('mind-note:getByScope', scope)
      this.setState({ notes: notes || [] })
    } catch (e) {
      console.error('Failed to load mind notes', e)
      this.setState({ notes: [] })
    } finally {
      this.setState({ loading: false })
    }
  }

  async createNote(scope: string, title: string, projectPath?: string) {
    const id = crypto.randomUUID()
    const note = await ipcRenderer.invoke('mind-note:create', {
      id,
      title,
      scope,
      projectPath,
      content: ''
    })
    await this.loadNotes(scope)
    await this.loadScopes()
    return note
  }

  async deleteNote(id: string) {
    await ipcRenderer.invoke('mind-note:delete', id)
    if (this.state.activeNoteId === id) {
      this.setState({ activeNoteId: null })
    }
    await this.loadNotes(this.state.activeScope)
    await this.loadScopes()
  }

  async saveNote(id: string, data: { title?: string; content?: string }) {
    await ipcRenderer.invoke('mind-note:update', id, {
      ...data,
      updated: Date.now()
    })
  }

  selectNote(id: string | null) {
    this.setState({ activeNoteId: id })
  }

  async getNote(id: string): Promise<IMindNote | null> {
    return ipcRenderer.invoke('mind-note:get', id)
  }
}

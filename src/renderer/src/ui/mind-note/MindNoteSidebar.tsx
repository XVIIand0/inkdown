import { observer } from 'mobx-react-lite'
import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/store/store'
import { Brain, Plus, Trash2, Globe, FolderOpen } from 'lucide-react'

const formatTime = (ts: number) => {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const NoteItem = observer(
  ({
    note,
    onSelect,
    onDelete
  }: {
    note: IMindNote
    onSelect: (id: string, title: string) => void
    onDelete: (id: string) => void
  }) => {
    const store = useStore()
    const isActive = store.mindNote.state.activeNoteId === note.id
    const [hovering, setHovering] = useState(false)

    return (
      <div
        className={
          'flex items-center gap-2 py-1.5 px-3 mx-1 rounded cursor-pointer text-xs group ' +
          (isActive
            ? 'active-item-bg active-item-text'
            : 'md-text hover-bg')
        }
        onClick={() => onSelect(note.id, note.title)}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <span className={'truncate flex-1'}>{note.title || 'Untitled'}</span>
        {hovering ? (
          <button
            className={
              'shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 ' +
              'text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors'
            }
            onClick={(e) => {
              e.stopPropagation()
              onDelete(note.id)
            }}
          >
            <Trash2 className={'w-3 h-3'} />
          </button>
        ) : (
          <span className={'text-[10px] text-secondary shrink-0'}>
            {formatTime(note.updated)}
          </span>
        )}
      </div>
    )
  }
)

const ScopeSection = observer(
  ({
    label,
    icon,
    scope,
    projectPath,
    notes,
    onCreateNote
  }: {
    label: string
    icon: React.ReactNode
    scope: string
    projectPath?: string
    notes: IMindNote[]
    onCreateNote: (scope: string, projectPath?: string) => void
  }) => {
    const store = useStore()
    const scopeNotes = notes.filter((n) => n.scope === scope)

    const handleSelect = useCallback(
      (id: string, title: string) => {
        store.mindNote.selectNote(id)
        if (store.centerTabs) {
          ;(store.centerTabs as any).openMindNoteTab?.(id, title)
        }
      },
      [store]
    )

    const handleDelete = useCallback(
      (id: string) => {
        store.mindNote.deleteNote(id)
      },
      [store]
    )

    return (
      <div className={'mb-2'}>
        <div className={'flex items-center gap-1.5 px-3 py-1.5'}>
          {icon}
          <span
            className={'text-xs font-medium text-secondary uppercase flex-1'}
          >
            {label}
          </span>
          <button
            className={
              'p-0.5 rounded text-secondary ' +
              'hover-bg transition-colors'
            }
            onClick={() => onCreateNote(scope, projectPath)}
            title={'New note'}
          >
            <Plus className={'w-3.5 h-3.5'} />
          </button>
        </div>
        {scopeNotes.length === 0 ? (
          <div className={'text-[10px] text-secondary px-4 py-1'}>
            No notes yet
          </div>
        ) : (
          scopeNotes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    )
  }
)

export const MindNoteSidebar = observer(() => {
  const store = useStore()
  const [allNotes, setAllNotes] = useState<IMindNote[]>([])

  const activeProject = store.claudeCode?.activeProject

  const loadAll = useCallback(async () => {
    const scopes = ['global']
    if (activeProject?.id) {
      scopes.push(activeProject.id)
    }
    const results: IMindNote[] = []
    for (const scope of scopes) {
      const notes = await window.electron.ipcRenderer.invoke('mind-note:getByScope', scope)
      if (notes) results.push(...notes)
    }
    setAllNotes(results)
  }, [activeProject?.id])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleCreateNote = useCallback(
    async (scope: string, projectPath?: string) => {
      const note = await store.mindNote.createNote(scope, 'New Note', projectPath)
      if (note) {
        store.mindNote.selectNote(note.id)
        if (store.centerTabs) {
          ;(store.centerTabs as any).openMindNoteTab?.(note.id, note.title)
        }
      }
      loadAll()
    },
    [store, loadAll]
  )

  const projectName = activeProject?.path?.split(/[/\\]/).filter(Boolean).pop()

  return (
    <div className={'flex flex-col'}>
      <div
        className={
          'flex items-center gap-2 px-3 py-2 border-b border-theme shrink-0'
        }
      >
        <Brain className={'w-4 h-4 text-purple-500'} />
        <span className={'text-sm font-medium md-text'}>Mind Notes</span>
      </div>

      <div className={'py-1'}>
        <ScopeSection
          label={'Global'}
          icon={<Globe className={'w-3 h-3 text-gray-400'} />}
          scope={'global'}
          notes={allNotes}
          onCreateNote={handleCreateNote}
        />

        {activeProject && (
          <ScopeSection
            label={projectName || 'Project'}
            icon={<FolderOpen className={'w-3 h-3 text-amber-500'} />}
            scope={activeProject.id}
            projectPath={activeProject.path}
            notes={allNotes}
            onCreateNote={handleCreateNote}
          />
        )}
      </div>
    </div>
  )
})

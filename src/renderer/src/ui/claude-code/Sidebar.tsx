import { observer } from 'mobx-react-lite'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/store'
import { useTranslation } from 'react-i18next'
import {
  FolderOpen,
  Folder,
  MessageSquare,
  FileText,
  ChevronRight,
  ChevronDown,
  Terminal,
  Brain,
  Plus,
  Trash2,
  Globe,
  Search,
  X,
  Loader2,
  ArrowLeft
} from 'lucide-react'

type ViewMode = 'sessions' | 'files' | 'notes'

const FileTreeItem = ({ node, depth = 0 }: { node: IClaudeFileNode; depth?: number }) => {
  const [expanded, setExpanded] = useState(false)
  const paddingLeft = 12 + depth * 16

  if (node.isDirectory) {
    return (
      <div>
        <div
          className={
            'flex items-center gap-1.5 py-1 px-2 cursor-pointer text-xs ' +
            'text-secondary hover-bg rounded'
          }
          style={{ paddingLeft }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className={'w-3 h-3 shrink-0'} />
          ) : (
            <ChevronRight className={'w-3 h-3 shrink-0'} />
          )}
          {expanded ? (
            <FolderOpen className={'w-3.5 h-3.5 shrink-0 text-amber-500'} />
          ) : (
            <Folder className={'w-3.5 h-3.5 shrink-0 text-amber-500'} />
          )}
          <span className={'truncate'}>{node.name}</span>
        </div>
        {expanded && node.children?.map((child, i) => (
          <FileTreeItem key={child.name + i} node={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  const store = useStore()

  const handleFileClick = useCallback(() => {
    store.codeFile.loadFile(node.path)
    store.centerTabs.openCodeFileTab(node.path)
  }, [store, node.path])

  return (
    <div
      className={
        'flex items-center gap-1.5 py-1 px-2 text-xs cursor-pointer ' +
        'text-secondary hover-bg rounded'
      }
      style={{ paddingLeft: paddingLeft + 16 }}
      onClick={handleFileClick}
    >
      <FileText className={'w-3.5 h-3.5 shrink-0 text-blue-400'} />
      <span className={'truncate'}>{node.name}</span>
    </div>
  )
}

const FileTreeView = observer(() => {
  const store = useStore()
  const files = store.claudeCode.state.fileTree

  if (files.length === 0) {
    return (
      <div className={'text-xs text-secondary px-4 py-2'}>
        No files
      </div>
    )
  }

  return (
    <div className={'py-1'}>
      {files.map((node, i) => (
        <FileTreeItem key={node.name + i} node={node} />
      ))}
    </div>
  )
})

const SessionList = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const sessions = store.claudeCode.state.sessions
  const activeSessionId = store.claudeCode.state.activeSessionId
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSessions = searchQuery
    ? sessions.filter((s: IClaudeSession) =>
        (s.firstMessage || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sessions

  const handleSelectSession = useCallback((sessionId: string) => {
    const session = store.claudeCode.state.sessions.find(
      (s: IClaudeSession) => s.id === sessionId
    )
    store.centerTabs.openSessionTab(
      store.claudeCode.state.activeProjectId,
      sessionId,
      session?.firstMessage || 'Session'
    )
    store.claudeCode.selectSession(sessionId)
  }, [store])

  if (sessions.length === 0) {
    return (
      <div className={'text-xs text-secondary px-4 py-2'}>
        {t('claudeCode.noSessions')}
      </div>
    )
  }

  return (
    <div className={'py-1'}>
      <div className={'relative px-2 mb-1'}>
        <Search
          className={
            'absolute left-3.5 top-1/2 -translate-y-1/2 w-3 h-3 text-secondary pointer-events-none'
          }
        />
        <input
          type={'text'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('claudeCode.searchSessions')}
          className={
            'w-full text-xs py-1 pl-6 pr-6 rounded border border-theme ' +
            'primary-bg-color md-text placeholder:text-secondary ' +
            'outline-none focus:border-blue-500 transition-colors'
          }
        />
        {searchQuery && (
          <button
            className={
              'absolute right-3.5 top-1/2 -translate-y-1/2 text-secondary ' +
              'hover:text-current transition-colors'
            }
            onClick={() => setSearchQuery('')}
          >
            <X className={'w-3 h-3'} />
          </button>
        )}
      </div>
      {filteredSessions.map((session: IClaudeSession) => {
        const isActive = session.id === activeSessionId

        return (
          <div
            key={session.id}
            className={
              'flex items-center gap-2 py-1.5 px-3 mx-1 rounded cursor-pointer text-xs ' +
              (isActive
                ? 'active-item-bg active-item-text'
                : 'md-text hover-bg')
            }
            onClick={() => handleSelectSession(session.id)}
          >
            <MessageSquare className={'w-3.5 h-3.5 shrink-0'} />
            <span className={'truncate flex-1'}>
              {session.firstMessage || 'Untitled'}
            </span>
            <span className={'text-[10px] text-secondary shrink-0'}>
              {session.messageCount}
            </span>
          </div>
        )
      })}
    </div>
  )
})

const formatTime = (ts: number) => {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const NoteList = observer(({ scope, projectPath }: { scope: string; projectPath?: string }) => {
  const store = useStore()
  const [notes, setNotes] = useState<IMindNote[]>([])

  const loadNotes = useCallback(async () => {
    const result = await window.electron.ipcRenderer.invoke('mind-note:getByScope', scope)
    setNotes(result || [])
  }, [scope])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  const handleCreate = useCallback(async () => {
    const note = await store.mindNote.createNote(scope, 'New Note', projectPath)
    if (note) {
      store.mindNote.selectNote(note.id)
      store.centerTabs.openMindNoteTab(note.id, note.title)
    }
    loadNotes()
  }, [store, scope, projectPath, loadNotes])

  const handleSelect = useCallback(
    (note: IMindNote) => {
      store.mindNote.selectNote(note.id)
      store.centerTabs.openMindNoteTab(note.id, note.title || 'Untitled')
    },
    [store]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await store.mindNote.deleteNote(id)
      loadNotes()
    },
    [store, loadNotes]
  )

  return (
    <div className={'py-1'}>
      <div className={'flex items-center justify-end px-3 mb-1'}>
        <button
          className={'p-0.5 rounded text-secondary hover-bg transition-colors'}
          onClick={handleCreate}
          title={'New note'}
        >
          <Plus className={'w-3.5 h-3.5'} />
        </button>
      </div>
      {notes.length === 0 ? (
        <div className={'text-xs text-secondary px-4 py-2'}>
          No notes yet
        </div>
      ) : (
        notes.map((note) => {
          const isActive = store.mindNote.state.activeNoteId === note.id
          return (
            <NoteItem
              key={note.id}
              note={note}
              isActive={isActive}
              onSelect={() => handleSelect(note)}
              onDelete={() => handleDelete(note.id)}
            />
          )
        })
      )}
    </div>
  )
})

const NoteItem = ({
  note,
  isActive,
  onSelect,
  onDelete
}: {
  note: IMindNote
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) => {
  const [hovering, setHovering] = useState(false)

  return (
    <div
      className={
        'flex items-center gap-2 py-1.5 px-3 mx-1 rounded cursor-pointer text-xs ' +
        (isActive ? 'active-item-bg active-item-text' : 'md-text hover-bg')
      }
      onClick={onSelect}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <Brain className={'w-3.5 h-3.5 shrink-0'} />
      <span className={'truncate flex-1'}>{note.title || 'Untitled'}</span>
      {hovering ? (
        <button
          className={
            'shrink-0 p-0.5 rounded text-secondary hover:text-red-500 transition-colors'
          }
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
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

const ProjectItem = observer(({ project }: { project: IClaudeProject }) => {
  const store = useStore()
  const { t } = useTranslation()
  const isActive = store.claudeCode.state.activeProjectId === project.id
  const [expanded, setExpanded] = useState(isActive)
  const [viewMode, setViewMode] = useState<ViewMode>('sessions')

  const handleToggle = useCallback(() => {
    const willExpand = !expanded
    setExpanded(willExpand)
    if (willExpand) {
      store.claudeCode.selectProject(project.id)
    }
  }, [expanded, project.id, store])

  const displayName = project.path.split(/[/\\]/).filter(Boolean).pop() || project.path

  useEffect(() => {
    if (isActive && viewMode === 'files' && store.claudeCode.state.fileTree.length === 0) {
      store.claudeCode.loadFileTree()
    }
  }, [isActive, viewMode])

  return (
    <div className={'border-b border-theme last:border-b-0'}>
      <div
        className={
          'flex items-center gap-1.5 py-2 px-2 cursor-pointer ' +
          'hover-bg ' +
          (project.sessionCount === 0 ? 'opacity-50' : '')
        }
        onClick={handleToggle}
      >
        {expanded ? (
          <ChevronDown className={'w-3.5 h-3.5 shrink-0 text-secondary'} />
        ) : (
          <ChevronRight className={'w-3.5 h-3.5 shrink-0 text-secondary'} />
        )}
        <Folder className={'w-4 h-4 shrink-0 text-amber-500'} />
        <span
          className={'text-sm truncate flex-1 md-text'}
          title={project.path}
        >
          {displayName}
        </span>
        {project.sessionCount > 0 && (
          <span className={'text-[10px] text-secondary shrink-0'}>
            {project.sessionCount}
          </span>
        )}
      </div>

      {expanded && isActive && (
        <div className={'pb-1'}>
          <div className={'flex items-center gap-1 px-3 mb-1'}>
            <button
              className={
                'flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ' +
                (viewMode === 'sessions'
                  ? 'md-text'
                  : 'text-secondary hover-bg')
              }
              style={viewMode === 'sessions' ? { background: 'var(--md-bg-mute)' } : undefined}
              onClick={() => setViewMode('sessions')}
            >
              <MessageSquare className={'w-3 h-3'} />
              {t('claudeCode.sessions')}
            </button>
            <button
              className={
                'flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ' +
                (viewMode === 'files'
                  ? 'md-text'
                  : 'text-secondary hover-bg')
              }
              style={viewMode === 'files' ? { background: 'var(--md-bg-mute)' } : undefined}
              onClick={() => {
                setViewMode('files')
                if (store.claudeCode.state.fileTree.length === 0) {
                  store.claudeCode.loadFileTree()
                }
              }}
            >
              <FolderOpen className={'w-3 h-3'} />
              {t('claudeCode.files')}
            </button>
            <button
              className={
                'flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ' +
                (viewMode === 'notes'
                  ? 'md-text'
                  : 'text-secondary hover-bg')
              }
              style={viewMode === 'notes' ? { background: 'var(--md-bg-mute)' } : undefined}
              onClick={() => setViewMode('notes')}
            >
              <Brain className={'w-3 h-3'} />
              {t('claudeCode.mind')}
            </button>
          </div>

          <div className={'overflow-y-auto max-h-64'}>
            {viewMode === 'sessions' && <SessionList />}
            {viewMode === 'files' && <FileTreeView />}
            {viewMode === 'notes' && (
              <NoteList scope={project.id} projectPath={project.path} />
            )}
          </div>
        </div>
      )}
    </div>
  )
})

const GlobalNotes = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState<IMindNote[]>([])

  const loadNotes = useCallback(async () => {
    const result = await window.electron.ipcRenderer.invoke('mind-note:getByScope', 'global')
    setNotes(result || [])
  }, [])

  useEffect(() => {
    if (expanded) loadNotes()
  }, [expanded, loadNotes])

  const handleCreate = useCallback(async () => {
    const note = await store.mindNote.createNote('global', 'New Note')
    if (note) {
      store.mindNote.selectNote(note.id)
      store.centerTabs.openMindNoteTab(note.id, note.title)
    }
    loadNotes()
  }, [store, loadNotes])

  const handleSelect = useCallback(
    (note: IMindNote) => {
      store.mindNote.selectNote(note.id)
      store.centerTabs.openMindNoteTab(note.id, note.title || 'Untitled')
    },
    [store]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await store.mindNote.deleteNote(id)
      loadNotes()
    },
    [store, loadNotes]
  )

  return (
    <div className={'border-t border-theme'}>
      <div
        className={'flex items-center gap-1.5 py-2 px-2 cursor-pointer hover-bg'}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className={'w-3.5 h-3.5 shrink-0 text-secondary'} />
        ) : (
          <ChevronRight className={'w-3.5 h-3.5 shrink-0 text-secondary'} />
        )}
        <Globe className={'w-4 h-4 shrink-0 text-purple-500'} />
        <span className={'text-sm truncate flex-1 md-text'}>
          {t('claudeCode.globalNotes')}
        </span>
        {notes.length > 0 && !expanded && (
          <span className={'text-[10px] text-secondary shrink-0'}>
            {notes.length}
          </span>
        )}
        {expanded && (
          <button
            className={'p-0.5 rounded text-secondary hover-bg transition-colors'}
            onClick={(e) => {
              e.stopPropagation()
              handleCreate()
            }}
            title={'New note'}
          >
            <Plus className={'w-3.5 h-3.5'} />
          </button>
        )}
      </div>
      {expanded && (
        <div className={'overflow-y-auto max-h-48 pb-1'}>
          {notes.length === 0 ? (
            <div className={'text-xs text-secondary px-4 py-2'}>
              No notes yet
            </div>
          ) : (
            notes.map((note) => {
              const isActive = store.mindNote.state.activeNoteId === note.id
              return (
                <NoteItem
                  key={note.id}
                  note={note}
                  isActive={isActive}
                  onSelect={() => handleSelect(note)}
                  onDelete={() => handleDelete(note.id)}
                />
              )
            })
          )}
        </div>
      )}
    </div>
  )
})

const HighlightedSnippet = ({ text, query }: { text: string; query: string }) => {
  if (!query) return <span>{text}</span>
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const parts: Array<{ text: string; highlight: boolean }> = []
  let lastIndex = 0

  while (lastIndex < text.length) {
    const idx = lowerText.indexOf(lowerQuery, lastIndex)
    if (idx === -1) {
      parts.push({ text: text.substring(lastIndex), highlight: false })
      break
    }
    if (idx > lastIndex) {
      parts.push({ text: text.substring(lastIndex, idx), highlight: false })
    }
    parts.push({ text: text.substring(idx, idx + query.length), highlight: true })
    lastIndex = idx + query.length
  }

  return (
    <span>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark key={i} className={'bg-yellow-500/30 text-current rounded-sm px-0.5'}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  )
}

const GlobalSearchResults = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const { searchResults, searchLoading, searchQuery } = store.claudeCode.state

  const handleOpenSession = useCallback(
    (projectId: string, sessionId: string, snippet: string) => {
      store.claudeCode.selectProject(projectId)
      store.centerTabs.openSessionTab(projectId, sessionId, snippet.substring(0, 60) || 'Session')
      store.claudeCode.selectSession(sessionId)
    },
    [store]
  )

  if (searchLoading) {
    return (
      <div className={'flex items-center justify-center gap-2 py-8 text-secondary'}>
        <Loader2 className={'w-4 h-4 animate-spin'} />
        <span className={'text-xs'}>{t('claudeCode.searching')}</span>
      </div>
    )
  }

  const totalMatches = searchResults.reduce(
    (sum: number, r: any) => sum + r.matches.length,
    0
  )

  if (totalMatches === 0) {
    return (
      <div className={'flex flex-col items-center justify-center py-8 text-secondary'}>
        <Search className={'w-6 h-6 mb-2 opacity-30'} />
        <span className={'text-xs'}>{t('claudeCode.noResults')}</span>
      </div>
    )
  }

  return (
    <div className={'py-1'}>
      <div className={'text-[10px] text-secondary px-3 py-1'}>
        {t('claudeCode.searchResults', { count: totalMatches })}
      </div>
      {searchResults.map((result: any) => {
        const displayName =
          result.projectPath.split(/[/\\]/).filter(Boolean).pop() || result.projectPath
        return (
          <div key={result.projectId + '-' + result.sessionId} className={'mb-1'}>
            <div className={'text-[10px] text-secondary px-3 py-0.5 flex items-center gap-1'}>
              <Folder className={'w-3 h-3 text-amber-500'} />
              <span className={'truncate'} title={result.projectPath}>
                {displayName}
              </span>
            </div>
            {result.matches.map((match: any, i: number) => (
              <div
                key={i}
                className={
                  'py-1.5 px-3 mx-1 rounded cursor-pointer text-xs ' +
                  'md-text hover-bg transition-colors'
                }
                onClick={() => handleOpenSession(result.projectId, result.sessionId, match.content)}
              >
                <div className={'flex items-center gap-1 mb-0.5'}>
                  <MessageSquare className={'w-3 h-3 shrink-0 text-secondary'} />
                  <span className={'text-[10px] text-secondary'}>
                    {match.type === 'user' ? t('claudeCode.user') : 'Assistant'}
                  </span>
                  {match.timestamp > 0 && (
                    <span className={'text-[10px] text-secondary ml-auto'}>
                      {formatTime(match.timestamp)}
                    </span>
                  )}
                </div>
                <div className={'text-xs leading-relaxed break-words opacity-80'}>
                  <HighlightedSnippet text={match.content} query={searchQuery} />
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
})

export const ClaudeCodeSidebar = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const [localQuery, setLocalQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    store.claudeCode.loadProjects()
  }, [store])

  const projects = store.claudeCode.state.projects
  const isSearchActive = store.claudeCode.state.searchQuery !== ''
    || store.claudeCode.state.searchLoading

  const handleSearchSubmit = useCallback(() => {
    if (localQuery.trim()) {
      store.claudeCode.searchAllSessions(localQuery.trim())
    }
  }, [store, localQuery])

  const handleClearSearch = useCallback(() => {
    setLocalQuery('')
    store.claudeCode.clearSearch()
    inputRef.current?.focus()
  }, [store])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearchSubmit()
      } else if (e.key === 'Escape') {
        handleClearSearch()
      }
    },
    [handleSearchSubmit, handleClearSearch]
  )

  return (
    <div className={'flex flex-col h-full primary-bg-color'}>
      <div
        className={
          'flex items-center gap-2 px-3 py-3 border-b border-theme shrink-0'
        }
      >
        <Terminal className={'w-4 h-4 text-blue-500'} />
        <span className={'text-sm font-medium md-text'}>
          {t('claudeCode.title')}
        </span>
      </div>

      <div className={'px-2 py-2 border-b border-theme shrink-0'}>
        <div className={'relative'}>
          <Search
            className={
              'absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-secondary ' +
              'pointer-events-none'
            }
          />
          <input
            ref={inputRef}
            type={'text'}
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('claudeCode.globalSearch')}
            className={
              'w-full text-xs py-1.5 pl-7 pr-7 rounded border border-theme ' +
              'primary-bg-color md-text placeholder:text-secondary ' +
              'outline-none focus:border-blue-500 transition-colors'
            }
          />
          {(localQuery || isSearchActive) && (
            <button
              className={
                'absolute right-2 top-1/2 -translate-y-1/2 text-secondary ' +
                'hover:text-current transition-colors'
              }
              onClick={handleClearSearch}
            >
              <X className={'w-3.5 h-3.5'} />
            </button>
          )}
        </div>
      </div>

      {isSearchActive ? (
        <div className={'flex-1 overflow-y-auto'}>
          <div className={'flex items-center gap-1 px-2 py-1.5'}>
            <button
              className={
                'flex items-center gap-1 text-xs text-secondary ' +
                'hover:text-current transition-colors'
              }
              onClick={handleClearSearch}
            >
              <ArrowLeft className={'w-3 h-3'} />
              {t('back')}
            </button>
          </div>
          <GlobalSearchResults />
        </div>
      ) : (
        <div className={'flex-1 overflow-y-auto'}>
          {projects.length === 0 ? (
            <div className={'flex flex-col items-center justify-center h-32 text-secondary'}>
              <Terminal className={'w-8 h-8 mb-2 opacity-30'} />
              <span className={'text-xs'}>{t('claudeCode.noProjects')}</span>
            </div>
          ) : (
            projects.map((project: IClaudeProject) => (
              <ProjectItem key={project.id} project={project} />
            ))
          )}
          <GlobalNotes />
        </div>
      )}
    </div>
  )
})

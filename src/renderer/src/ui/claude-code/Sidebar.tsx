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
  ArrowLeft,
  Monitor,
  Server,
  RefreshCw,
  Pin,
  Settings,
  FolderCog
} from 'lucide-react'
import { openMenus } from '@/ui/common/Menu'
import { IconType, renderIconPreview } from './IconPicker'
import { openCustomizeDialog } from './CustomizeDialog'

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

const ipcRenderer = window.electron.ipcRenderer

interface PinnedSessionInfo {
  id: string
  name: string
}

const PinnedSessionPreview = ({
  projectId,
  hostId
}: {
  projectId: string
  hostId?: string | null
}) => {
  const store = useStore()
  const [pinnedSessions, setPinnedSessions] = useState<PinnedSessionInfo[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [pins, aliases, sessions] = await Promise.all([
          ipcRenderer.invoke('claude-code:getSessionPins', projectId, hostId || null),
          ipcRenderer.invoke('claude-code:getSessionAliases', projectId, hostId || null),
          hostId
            ? ipcRenderer.invoke('ssh-host:getRemoteSessions', hostId, projectId)
            : ipcRenderer.invoke('claude-code:getSessions', projectId)
        ])
        if (cancelled) return
        const pinSet = new Set(pins as string[])
        const aliasMap = aliases as Record<string, string>
        const pinned = (sessions as IClaudeSession[])
          .filter((s) => pinSet.has(s.id))
          .map((s) => ({
            id: s.id,
            name: aliasMap[s.id] || s.firstMessage || 'Untitled'
          }))
        setPinnedSessions(pinned)
      } catch {
        // ignore
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, hostId])

  const handleClick = (sessionId: string, displayName: string) => {
    store.centerTabs.openSessionTab(projectId, sessionId, displayName, hostId || undefined)
  }

  if (pinnedSessions.length === 0) return null

  return (
    <div className={'py-0.5'}>
      {pinnedSessions.map((s) => (
        <div
          key={s.id}
          className={'flex items-center gap-2 py-1 px-6 cursor-pointer text-xs md-text hover-bg'}
          onClick={(e) => {
            e.stopPropagation()
            handleClick(s.id, s.name)
          }}
        >
          <Pin className={'w-3 h-3 shrink-0 text-blue-400'} />
          <span className={'truncate flex-1'}>{s.name}</span>
        </div>
      ))}
    </div>
  )
}

const SessionList = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const sessions = store.claudeCode.state.sessions
  const activeSessionId = store.claudeCode.state.activeSessionId
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const filteredSessions = searchQuery
    ? sessions.filter((s: IClaudeSession) => {
        const displayName = store.claudeCode.getSessionDisplayName(s)
        return displayName.toLowerCase().includes(searchQuery.toLowerCase())
      })
    : sessions

  const pinnedIds = store.claudeCode.state.pinnedSessionIds
  const pinnedSessions = filteredSessions.filter(
    (s: IClaudeSession) => pinnedIds.includes(s.id)
  )
  const unpinnedSessions = filteredSessions.filter(
    (s: IClaudeSession) => !pinnedIds.includes(s.id)
  )

  const handleSelectSession = useCallback((sessionId: string) => {
    const session = store.claudeCode.state.sessions.find(
      (s: IClaudeSession) => s.id === sessionId
    )
    const displayName = session ? store.claudeCode.getSessionDisplayName(session) : 'Session'
    store.centerTabs.openSessionTab(
      store.claudeCode.state.activeProjectId,
      sessionId,
      displayName,
      store.claudeCode.state.activeHostId || undefined
    )
    store.claudeCode.selectSession(sessionId)
  }, [store])

  const handleContextMenu = useCallback((e: React.MouseEvent, session: IClaudeSession) => {
    e.preventDefault()
    e.stopPropagation()
    const isPinned = store.claudeCode.isSessionPinned(session.id)
    openMenus(e, [
      {
        text: isPinned ? t('claudeCode.unpinSession') : t('claudeCode.pinSession'),
        click: () => store.claudeCode.toggleSessionPin(session.id)
      },
      {
        text: t('claudeCode.renameSession'),
        click: () => {
          setEditingId(session.id)
          setEditValue(store.claudeCode.state.sessionAliases[session.id] || '')
          setTimeout(() => editInputRef.current?.focus(), 50)
        }
      },
      {
        text: t('claudeCode.copySessionId'),
        click: () => navigator.clipboard.writeText(session.id)
      }
    ])
  }, [store, t])

  const handleRenameSubmit = useCallback((sessionId: string) => {
    store.claudeCode.renameSession(sessionId, editValue)
    setEditingId(null)
  }, [store, editValue])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent, sessionId: string) => {
    if (e.key === 'Enter') {
      handleRenameSubmit(sessionId)
    } else if (e.key === 'Escape') {
      setEditingId(null)
    }
  }, [handleRenameSubmit])

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
      {pinnedSessions.map((session: IClaudeSession) => {
        const isActive = session.id === activeSessionId
        const displayName = store.claudeCode.getSessionDisplayName(session)
        const isEditing = editingId === session.id

        return (
          <div
            key={session.id}
            className={
              'flex items-center gap-2 py-1.5 px-3 mx-1 rounded cursor-pointer text-xs ' +
              (isActive
                ? 'active-item-bg active-item-text'
                : 'md-text hover-bg')
            }
            onClick={() => !isEditing && handleSelectSession(session.id)}
            onContextMenu={(e) => handleContextMenu(e, session)}
          >
            <Pin className={'w-3 h-3 shrink-0 text-blue-400'} />
            {isEditing ? (
              <input
                ref={editInputRef}
                type={'text'}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => handleRenameKeyDown(e, session.id)}
                onBlur={() => handleRenameSubmit(session.id)}
                placeholder={session.firstMessage || 'Untitled'}
                className={
                  'flex-1 text-xs py-0 px-1 rounded border border-blue-500 ' +
                  'primary-bg-color md-text outline-none min-w-0'
                }
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={'truncate flex-1'} title={displayName}>
                {displayName}
              </span>
            )}
            <span className={'text-[10px] text-secondary shrink-0'}>
              {session.messageCount}
            </span>
          </div>
        )
      })}
      {pinnedSessions.length > 0 && unpinnedSessions.length > 0 && (
        <div className={'mx-3 my-1 border-t border-theme'} />
      )}
      {unpinnedSessions.map((session: IClaudeSession) => {
        const isActive = session.id === activeSessionId
        const displayName = store.claudeCode.getSessionDisplayName(session)
        const isEditing = editingId === session.id

        return (
          <div
            key={session.id}
            className={
              'flex items-center gap-2 py-1.5 px-3 mx-1 rounded cursor-pointer text-xs ' +
              (isActive
                ? 'active-item-bg active-item-text'
                : 'md-text hover-bg')
            }
            onClick={() => !isEditing && handleSelectSession(session.id)}
            onContextMenu={(e) => handleContextMenu(e, session)}
          >
            <MessageSquare className={'w-3.5 h-3.5 shrink-0'} />
            {isEditing ? (
              <input
                ref={editInputRef}
                type={'text'}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => handleRenameKeyDown(e, session.id)}
                onBlur={() => handleRenameSubmit(session.id)}
                placeholder={session.firstMessage || 'Untitled'}
                className={
                  'flex-1 text-xs py-0 px-1 rounded border border-blue-500 ' +
                  'primary-bg-color md-text outline-none min-w-0'
                }
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={'truncate flex-1'} title={displayName}>
                {displayName}
              </span>
            )}
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

const HostGroupHeader = observer(({
  hostId,
  hostName,
  iconType,
  iconValue,
  isExpanded,
  onToggle,
  projectCount
}: {
  hostId: string | null
  hostName: string
  iconType: string
  iconValue?: string
  isExpanded: boolean
  onToggle: () => void
  projectCount: number
}) => {
  const store = useStore()
  const { t } = useTranslation()

  const handleManageProjects = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (hostId) {
      const host = store.sshHost.state.hosts.find((h: any) => h.id === hostId)
      store.sshHost.openHostDialog(host, 'claude-code')
    } else {
      store.claudeCode.openManageProjectsDialog(null)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const items: any[] = [
      {
        text: t('claudeCode.manageProjects'),
        click: () => {
          if (hostId) {
            const h = store.sshHost.state.hosts.find((h: any) => h.id === hostId)
            store.sshHost.openHostDialog(h, 'claude-code')
          } else {
            store.claudeCode.openManageProjectsDialog(null)
          }
        }
      }
    ]
    if (!hostId) {
      items.push(
        {
          text: t('claudeCode.openTerminal'),
          icon: <Terminal size={14} />,
          click: () => {
            store.centerTabs.openLocalTerminalTab('~', 'Terminal')
          }
        },
        {
          text: t('claudeCode.customize'),
          icon: <Settings size={14} />,
          click: () => {
            openCustomizeDialog({
              type: 'local-host',
              name: hostName,
              iconType: (iconType || 'default') as IconType,
              iconValue: iconValue || ''
            })
          }
        }
      )
    }
    if (hostId) {
      const host = store.sshHost.state.hosts.find((h: any) => h.id === hostId)
      items.push(
        {
          text: t('sshHost.editHost'),
          click: () => store.sshHost.openHostDialog(host)
        },
        {
          text: t('sshHost.openTerminal'),
          click: () => {
            if (host) store.centerTabs.openSshTerminalTab(hostId, host.name)
          }
        },
        {
          text: t('sshHost.testConnection'),
          click: () => store.sshHost.testHost(hostId)
        }
      )
      // Address switching
      if (host?.addresses && host.addresses.length > 1) {
        items.push({ hr: true })
        for (const addr of host.addresses) {
          const label = addr.label || `${addr.hostname}:${addr.port}`
          const isActive = addr.id === host.activeAddressId
          items.push({
            text: label + (isActive ? ` (${t('sshHost.activeAddress')})` : ''),
            click: () => store.sshHost.setActiveAddress(hostId, addr.id)
          })
        }
      }
      items.push(
        { hr: true },
        {
          text: t('sshHost.deleteHost'),
          click: () => store.sshHost.deleteHost(hostId)
        }
      )
    }
    openMenus(e, items)
  }

  const renderIcon = () => {
    const preview = renderIconPreview(iconType, iconValue)
    if (preview) return preview
    if (!hostId) return <Monitor size={14} className={'shrink-0 text-secondary'} />
    return <Server size={14} className={'shrink-0 text-secondary'} />
  }

  return (
    <div
      className={'flex items-center gap-1.5 px-3 py-2 cursor-pointer hover-bg select-none group/host'}
      onClick={onToggle}
      onContextMenu={handleContextMenu}
    >
      <ChevronRight
        size={14}
        className={
          'shrink-0 text-secondary transition-transform ' +
          (isExpanded ? 'rotate-90' : '')
        }
      />
      {renderIcon()}
      <span className={'text-sm font-medium md-text truncate flex-1'}>{hostName}</span>
      <button
        className={
          'p-0.5 rounded text-secondary hover-bg transition-colors opacity-0 ' +
          'group-hover/host:opacity-100'
        }
        onClick={handleManageProjects}
        title={t('claudeCode.manageProjects')}
      >
        <FolderCog size={13} />
      </button>
      {projectCount > 0 && (
        <span className={'text-[10px] text-secondary'}>{projectCount}</span>
      )}
    </div>
  )
})

const ProjectIcon = observer(({ projectId }: { projectId: string }) => {
  const store = useStore()
  const config = store.claudeCode.getProjectConfig(projectId)
  const preview = renderIconPreview(config.iconType, config.iconValue)
  if (preview) return preview
  return <Folder className={'w-4 h-4 shrink-0 text-amber-500'} />
})

const ProjectItem = observer(({
  project,
  hostId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: {
  project: IClaudeProject
  hostId?: string | null
  onDragStart?: (e: React.DragEvent, projectId: string) => void
  onDragOver?: (e: React.DragEvent, projectId: string) => void
  onDrop?: (e: React.DragEvent, projectId: string) => void
  onDragEnd?: () => void
}) => {
  const store = useStore()
  const { t } = useTranslation()
  const isActive = store.claudeCode.state.activeProjectId === project.id
  const [expanded, setExpanded] = useState(isActive)
  const [viewMode, setViewMode] = useState<ViewMode>('sessions')
  const [dragOver, setDragOver] = useState(false)

  const handleToggle = useCallback(() => {
    if (expanded && isActive) {
      // Collapse: just close
      setExpanded(false)
    } else if (expanded && !isActive) {
      // Already expanded but not active: activate it
      store.claudeCode.selectProject(project.id, hostId)
    } else {
      // Expand and activate
      setExpanded(true)
      store.claudeCode.selectProject(project.id, hostId)
    }
  }, [expanded, isActive, project.id, hostId, store])

  const config = store.claudeCode.getProjectConfig(project.id)
  const displayName = config.displayName || project.path.split(/[/\\]/).filter(Boolean).pop() || project.path

  useEffect(() => {
    if (isActive && viewMode === 'files' && store.claudeCode.state.fileTree.length === 0) {
      store.claudeCode.loadFileTree()
    }
  }, [isActive, viewMode])

  const [syncing, setSyncing] = useState(false)

  const handleResyncProject = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!hostId || syncing) return
    setSyncing(true)
    try {
      await store.sshHost.resyncProject(project.id, hostId)
    } finally {
      setSyncing(false)
    }
  }, [hostId, project.id, syncing, store])

  const openProjectSettings = useCallback(() => {
    const config = store.claudeCode.getProjectConfig(project.id)
    openCustomizeDialog({
      type: 'project',
      projectId: project.id,
      name: config.displayName || displayName,
      path: project.path,
      iconType: (config.iconType || 'default') as IconType,
      iconValue: config.iconValue || ''
    })
  }, [store, project.id, project.path, displayName])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const items = [
      {
        text: t('claudeCode.openTerminal'),
        icon: <Terminal size={14} />,
        click: () => {
          store.centerTabs.openLocalTerminalTab(project.path, displayName)
        }
      },
      {
        text: t('claudeCode.projectSettings'),
        icon: <Settings size={14} />,
        click: openProjectSettings
      }
    ]
    openMenus(e, items)
  }, [store, project.path, displayName, t, openProjectSettings])

  return (
    <div
      className={
        'border-b border-theme last:border-b-0 ' +
        (dragOver ? 'border-t-2 border-t-blue-500' : '')
      }
      draggable
      onDragStart={(e) => onDragStart?.(e, project.id)}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
        onDragOver?.(e, project.id)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false)
        onDrop?.(e, project.id)
      }}
      onDragEnd={() => {
        setDragOver(false)
        onDragEnd?.()
      }}
    >
      <div
        className={
          'flex items-center gap-1.5 py-2 px-2 cursor-pointer ' +
          'hover-bg group/proj ' +
          (isActive ? 'active-bg ' : '') +
          (project.sessionCount === 0 && !isActive ? 'opacity-50' : '')
        }
        onClick={handleToggle}
        onContextMenu={handleContextMenu}
      >
        {expanded ? (
          <ChevronDown className={'w-3.5 h-3.5 shrink-0 text-secondary'} />
        ) : (
          <ChevronRight className={'w-3.5 h-3.5 shrink-0 text-secondary'} />
        )}
        <ProjectIcon projectId={project.id} />
        <span
          className={'text-sm truncate flex-1 md-text'}
          title={project.path}
        >
          {displayName}
        </span>
        <button
          className={
            'p-0.5 rounded text-secondary hover-bg transition-colors ' +
            'opacity-0 group-hover/proj:opacity-100 shrink-0'
          }
          onClick={(e) => {
            e.stopPropagation()
            openProjectSettings()
          }}
          title={t('claudeCode.projectSettings')}
        >
          <Settings size={11} />
        </button>
        {hostId && (
          <button
            className={
              'p-0.5 rounded text-secondary hover-bg transition-colors ' +
              'opacity-0 group-hover/proj:opacity-100 shrink-0 ' +
              (syncing ? '!opacity-100' : '')
            }
            onClick={handleResyncProject}
            title={t('sshHost.resyncProject')}
          >
            <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
          </button>
        )}
        {project.sessionCount > 0 && (
          <span className={'text-[10px] text-secondary shrink-0'}>
            {project.sessionCount}
          </span>
        )}
      </div>

      {expanded && !isActive && (
        <div className={'pb-1'}>
          <PinnedSessionPreview projectId={project.id} hostId={hostId} />
          <div
            className={'px-6 py-1 text-[10px] text-secondary cursor-pointer hover-bg'}
            onClick={() => store.claudeCode.selectProject(project.id, hostId)}
          >
            {project.sessionCount > 0
              ? `${project.sessionCount} sessions`
              : t('claudeCode.noSessions')}
          </div>
        </div>
      )}

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
            {!hostId && (
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
            )}
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
            <div className={'flex-1'} />
            <button
              className={
                'p-0.5 rounded text-secondary hover-bg transition-colors'
              }
              onClick={(e) => {
                e.stopPropagation()
                store.claudeCode.startNewConversation()
              }}
              title={t('claudeCode.newConversation')}
            >
              <Plus className={'w-3.5 h-3.5'} />
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

const ProjectGroup = observer(({
  group,
  isExpanded
}: {
  group: { hostId: string | null; projects: IClaudeProject[] }
  isExpanded: boolean
}) => {
  const store = useStore()
  const dragSourceRef = useRef<string | null>(null)

  const handleDragStart = useCallback((_e: React.DragEvent, projectId: string) => {
    dragSourceRef.current = projectId
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, _projectId: string) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback((_e: React.DragEvent, targetId: string) => {
    const sourceId = dragSourceRef.current
    if (!sourceId || sourceId === targetId) return
    const ids = group.projects.map((p) => p.id)
    const fromIdx = ids.indexOf(sourceId)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx < 0 || toIdx < 0) return
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, sourceId)
    store.claudeCode.reorderProjects(group.hostId, ids)
  }, [store, group.projects, group.hostId])

  const handleDragEnd = useCallback(() => {
    dragSourceRef.current = null
  }, [])

  const { t } = useTranslation()

  if (!isExpanded) return null

  // SSH host with no projects: show basic SSH actions
  if (group.hostId && group.projects.length === 0) {
    const host = store.sshHost.state.hosts.find((h: any) => h.id === group.hostId)
    return (
      <div className={'px-3 py-2 space-y-1'}>
        <button
          className={
            'flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs ' +
            'text-secondary hover-bg transition-colors'
          }
          onClick={() => {
            if (host) store.centerTabs.openSshTerminalTab(group.hostId!, host.name)
          }}
        >
          <Terminal size={13} />
          {t('sshHost.openTerminal')}
        </button>
        <button
          className={
            'flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs ' +
            'text-secondary hover-bg transition-colors'
          }
          onClick={() => store.sshHost.openHostDialog(host, 'claude-code')}
        >
          <FolderCog size={13} />
          {t('claudeCode.manageProjects')}
        </button>
      </div>
    )
  }

  return (
    <>
      {group.projects.map((p: IClaudeProject) => (
        <ProjectItem
          key={p.id}
          project={p}
          hostId={group.hostId}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        />
      ))}
    </>
  )
})

export const ClaudeCodeSidebar = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const [localQuery, setLocalQuery] = useState('')
  const [localExpanded, setLocalExpanded] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    store.claudeCode.loadProjects()
    store.sshHost.loadHosts()
  }, [store])

  const projects = store.claudeCode.state.projects
  const groupedProjects = store.claudeCode.groupedProjects
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
          {groupedProjects && groupedProjects.length > 0 ? (
            groupedProjects.map((group: any) => {
              const isExpanded = group.hostId === null
                ? localExpanded
                : store.sshHost.state.expandedHostIds.includes(group.hostId!)

              const borderColor = group.borderColor
              return (
                <div
                  key={group.hostId || 'local'}
                  className={'mb-1'}
                  style={borderColor ? {
                    borderLeft: `3px solid ${borderColor}`,
                    marginLeft: 2,
                    borderRadius: 3
                  } : undefined}
                >
                  <HostGroupHeader
                    hostId={group.hostId}
                    hostName={group.hostName}
                    iconType={group.iconType}
                    iconValue={group.iconValue}
                    isExpanded={isExpanded}
                    onToggle={() => {
                      if (group.hostId === null) setLocalExpanded(!localExpanded)
                      else store.sshHost.toggleHostExpanded(group.hostId!)
                    }}
                    projectCount={group.projects.length}
                  />
                  <ProjectGroup group={group} isExpanded={isExpanded} />
                </div>
              )
            })
          ) : projects.length === 0 ? (
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
          <button
            className={
              'flex items-center gap-2 w-full px-3 py-2 text-xs text-secondary ' +
              'hover-bg transition-colors'
            }
            onClick={() => store.sshHost.openHostDialog()}
          >
            <Plus size={14} />
            {t('sshHost.addHost')}
          </button>
        </div>
      )}
    </div>
  )
})

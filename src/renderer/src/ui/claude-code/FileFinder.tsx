import { useEffect, useMemo, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useStore } from '@/store/store'
import { useTranslation } from 'react-i18next'
import { Search, X, Clock, Folder } from 'lucide-react'
import { getFileTypeIcon } from '@/ui/common/FileTypeIcon'

const ipcRenderer = window.electron.ipcRenderer

interface FileEntry {
  rel: string
  abs: string
}

interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
}

const fileCache = new Map<string, FileEntry[]>()

function fuzzyMatch(query: string, candidate: string): { match: boolean; score: number } {
  const q = query.toLowerCase()
  const c = candidate.toLowerCase()
  let qi = 0
  let score = 0
  let lastMatchIndex = -1

  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] === q[qi]) {
      score += lastMatchIndex >= 0 && ci === lastMatchIndex + 1 ? 10 : 1
      if (
        ci === 0 ||
        c[ci - 1] === '/' ||
        c[ci - 1] === '.' ||
        c[ci - 1] === '-' ||
        c[ci - 1] === '_'
      ) {
        score += 5
      }
      lastMatchIndex = ci
      qi++
    }
  }

  return { match: qi === q.length, score }
}

function isAbsolutePathQuery(query: string): boolean {
  return query.startsWith('/') || query.startsWith('~')
}

function splitPathQuery(query: string): { dirPart: string; filterPart: string } {
  const lastSlash = query.lastIndexOf('/')
  if (lastSlash === -1) return { dirPart: query, filterPart: '' }
  const dirPart = query.substring(0, lastSlash + 1)
  const filterPart = query.substring(lastSlash + 1)
  return { dirPart, filterPart }
}

export const FileFinder = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const show = store.claudeCode.state.showFileFinder
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [dirEntries, setDirEntries] = useState<DirEntry[]>([])
  const [dirLoading, setDirLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track last mouse position to prevent scroll-triggered hover from stealing selection
  const lastMousePos = useRef({ x: 0, y: 0 })

  const isAbsMode = isAbsolutePathQuery(query)

  const activeTab = store.centerTabs.activeTab
  const projectId = activeTab?.projectId || store.claudeCode.state.activeProjectId
  const hostId = activeTab?.hostId || store.claudeCode.state.activeHostId

  const projectPath = useMemo(() => {
    if (!projectId) return null
    for (const group of store.claudeCode.groupedProjects) {
      const found = group.projects.find((p) => p.id === projectId)
      if (found) return found.path
    }
    return null
  }, [projectId, store.claudeCode.groupedProjects])

  // Load files when opened
  useEffect(() => {
    if (!show || !projectPath || hostId) return
    fileCache.delete(projectPath)
    setLoading(true)
    ipcRenderer
      .invoke('claude-code:getProjectFilesFlat', projectPath)
      .then((result: FileEntry[]) => {
        fileCache.set(projectPath, result)
        setFiles(result)
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false))
  }, [show, projectPath, hostId])

  // Reset on open
  useEffect(() => {
    if (show) {
      setQuery('')
      setSelectedIndex(0)
      setDirEntries([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [show])

  // Fetch directory entries for absolute path mode
  useEffect(() => {
    if (!isAbsMode) {
      setDirEntries([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const { dirPart } = splitPathQuery(query)
      setDirLoading(true)
      ipcRenderer
        .invoke('claude-code:listDirectory', dirPart)
        .then((result: DirEntry[]) => setDirEntries(result))
        .catch(() => setDirEntries([]))
        .finally(() => setDirLoading(false))
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, isAbsMode])

  // Filtered results
  const projectResults = useMemo(() => {
    if (isAbsMode) return []
    if (!query.trim()) {
      return store.claudeCode.state.recentFiles
        .filter((f) => f.projectId === projectId)
        .map((f) => ({ rel: f.rel, abs: f.abs, isRecent: true }))
    }
    return files
      .map((f) => {
        const { match, score } = fuzzyMatch(query, f.rel)
        return { ...f, match, score, isRecent: false }
      })
      .filter((f) => f.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
  }, [query, files, projectId, store.claudeCode.state.recentFiles, isAbsMode])

  const absResults = useMemo(() => {
    if (!isAbsMode) return []
    const { filterPart } = splitPathQuery(query)
    if (!filterPart) return dirEntries
    const lower = filterPart.toLowerCase()
    return dirEntries.filter((e) => e.name.toLowerCase().includes(lower))
  }, [isAbsMode, dirEntries, query])

  const results = isAbsMode ? absResults : projectResults

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results.length])

  const close = () => store.claudeCode.closeFileFinder()

  const openFile = (entry: { rel: string; abs: string }) => {
    store.centerTabs.openCodeFileTab(entry.abs, projectId || undefined, hostId || undefined)
    if (projectId) {
      store.claudeCode.addRecentFile({ rel: entry.rel, abs: entry.abs, projectId })
    }
    close()
  }

  const handleAbsSelect = (entry: DirEntry) => {
    if (entry.isDirectory) {
      setQuery(entry.path + '/')
    } else {
      store.centerTabs.openCodeFileTab(entry.path, projectId || undefined, hostId || undefined)
      if (projectId) {
        store.claudeCode.addRecentFile({ rel: entry.name, abs: entry.path, projectId })
      }
      close()
    }
  }

  const selectItem = (idx: number) => {
    if (results.length === 0) return
    if (isAbsMode) {
      handleAbsSelect(results[idx] as DirEntry)
    } else {
      openFile(results[idx] as { rel: string; abs: string })
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement
    if (item) item.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!show) return null

  const isLoading = isAbsMode ? dirLoading : loading

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      style={{ background: 'rgba(0,0,0,0.3)' }}
    >
      <div
        className="w-[560px] rounded-lg shadow-2xl overflow-hidden border border-theme"
        style={{ background: 'var(--primary-bg-color)' }}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-theme">
          <Search size={16} className="text-secondary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-sm md-text"
            placeholder={t('fileFinder.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex((i) => (i < results.length - 1 ? i + 1 : i))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex((i) => (i > 0 ? i - 1 : i))
              } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                selectItem(selectedIndex)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
          />
          {query && (
            <button
              className="p-0.5 rounded hover-bg text-secondary"
              onClick={() => setQuery('')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div ref={listRef} className="max-h-[400px] overflow-y-auto py-1">
          {!isAbsMode && !projectId && (
            <div className="px-4 py-8 text-center text-secondary text-sm">
              {t('fileFinder.noProject')}
            </div>
          )}

          {!isAbsMode && projectId && hostId && (
            <div className="px-4 py-8 text-center text-secondary text-sm">
              File finder is not available for remote projects
            </div>
          )}

          {isLoading && (
            <div className="px-4 py-8 text-center text-secondary text-sm">Loading...</div>
          )}

          {!isLoading && query && results.length === 0 && (
            <div className="px-4 py-8 text-center text-secondary text-sm">
              {t('fileFinder.noResults')}
            </div>
          )}

          {!isAbsMode && !loading && !query && results.length === 0 && projectId && !hostId && (
            <div className="px-4 py-8 text-center text-secondary text-sm">
              {t('fileFinder.noResults')}
            </div>
          )}

          {!isAbsMode && !query && results.length > 0 && (
            <div className="px-3 py-1 text-xs text-secondary">
              {t('fileFinder.recentFiles')}
            </div>
          )}

          {!isAbsMode &&
            results.map((entry, i) => (
              <div
                key={(entry as any).abs}
                data-idx={i}
                className={
                  'flex items-center gap-2 py-1.5 cursor-default text-sm ' +
                  (i === selectedIndex
                    ? 'md-text pl-2.5 border-l-2'
                    : 'md-text hover-bg px-3')
                }
                style={i === selectedIndex ? {
                  background: 'var(--accent-bg, rgba(59,130,246,0.12))',
                  borderColor: 'var(--accent, #3b82f6)'
                } : undefined}
                onClick={() => openFile(entry as { rel: string; abs: string })}
                onMouseMove={(e) => {
                  if (
                    Math.abs(e.clientX - lastMousePos.current.x) > 1 ||
                    Math.abs(e.clientY - lastMousePos.current.y) > 1
                  ) {
                    lastMousePos.current = { x: e.clientX, y: e.clientY }
                    setSelectedIndex(i)
                  }
                }}
              >
                {(entry as any).isRecent ? (
                  <Clock size={14} className="text-secondary shrink-0" />
                ) : (
                  getFileTypeIcon((entry as any).rel, 14)
                )}
                <span className="truncate flex-1">{(entry as any).rel}</span>
              </div>
            ))}

          {isAbsMode &&
            results.map((entry, i) => {
              const dirEntry = entry as DirEntry
              return (
                <div
                  key={dirEntry.path}
                  data-idx={i}
                  className={
                    'flex items-center gap-2 px-3 py-1.5 cursor-default text-sm ' +
                    (i === selectedIndex ? 'active-bg md-text' : 'md-text hover-bg')
                  }
                  onClick={() => handleAbsSelect(dirEntry)}
                  onMouseMove={(e) => {
                    if (
                      Math.abs(e.clientX - lastMousePos.current.x) > 1 ||
                      Math.abs(e.clientY - lastMousePos.current.y) > 1
                    ) {
                      lastMousePos.current = { x: e.clientX, y: e.clientY }
                      setSelectedIndex(i)
                    }
                  }}
                >
                  {dirEntry.isDirectory ? (
                    <Folder size={14} className="text-secondary shrink-0" />
                  ) : (
                    getFileTypeIcon(dirEntry.name, 14)
                  )}
                  <span className="truncate flex-1">{dirEntry.name}</span>
                </div>
              )
            })}
        </div>

        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-theme text-xs text-secondary">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
})

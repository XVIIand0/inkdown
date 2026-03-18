import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useStore } from '@/store/store'
import { useTranslation } from 'react-i18next'
import { Search, X, Clock, FileCode } from 'lucide-react'

const ipcRenderer = window.electron.ipcRenderer

interface FileEntry {
  rel: string
  abs: string
}

// File list cache per project
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
      // Bonus for matching after separator
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

  // Determine active project
  const activeTab = store.centerTabs.activeTab
  const projectId = activeTab?.projectId || store.claudeCode.state.activeProjectId
  const hostId = activeTab?.hostId || store.claudeCode.state.activeHostId

  // Find project path
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
    const cached = fileCache.get(projectPath)
    if (cached) {
      setFiles(cached)
      return
    }
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
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [show])

  // Filtered results
  const results = useMemo(() => {
    if (!query.trim()) {
      // Show recent files for current project
      return store.claudeCode.state.recentFiles
        .filter((f) => f.projectId === projectId)
        .map((f) => ({ rel: f.rel, abs: f.abs, isRecent: true }))
    }
    const scored = files
      .map((f) => {
        const { match, score } = fuzzyMatch(query, f.rel)
        return { ...f, match, score, isRecent: false }
      })
      .filter((f) => f.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
    return scored
  }, [query, files, projectId, store.claudeCode.state.recentFiles])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results.length])

  const close = useCallback(() => {
    store.claudeCode.closeFileFinder()
  }, [store])

  const openFile = useCallback(
    (entry: { rel: string; abs: string }) => {
      store.centerTabs.openCodeFileTab(entry.abs, projectId || undefined, hostId || undefined)
      if (projectId) {
        store.claudeCode.addRecentFile({ rel: entry.rel, abs: entry.abs, projectId })
      }
      close()
    },
    [store, projectId, hostId, close]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault()
        openFile(results[selectedIndex])
      }
    },
    [close, results, selectedIndex, openFile]
  )

  // Scroll selected into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement
    if (item) item.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!show) return null

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
            onKeyDown={handleKeyDown}
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
          {!projectId && (
            <div className="px-4 py-8 text-center text-secondary text-sm">
              {t('fileFinder.noProject')}
            </div>
          )}

          {projectId && hostId && (
            <div className="px-4 py-8 text-center text-secondary text-sm">
              File finder is not available for remote projects
            </div>
          )}

          {projectId && !hostId && loading && (
            <div className="px-4 py-8 text-center text-secondary text-sm">Loading...</div>
          )}

          {projectId && !hostId && !loading && !query && results.length === 0 && (
            <div className="px-4 py-8 text-center text-secondary text-sm">
              {t('fileFinder.noResults')}
            </div>
          )}

          {projectId && !hostId && !loading && query && results.length === 0 && (
            <div className="px-4 py-8 text-center text-secondary text-sm">
              {t('fileFinder.noResults')}
            </div>
          )}

          {!query && results.length > 0 && (
            <div className="px-3 py-1 text-xs text-secondary">
              {t('fileFinder.recentFiles')}
            </div>
          )}

          {results.map((entry, i) => (
            <div
              key={entry.abs}
              className={
                'flex items-center gap-2 px-3 py-1.5 cursor-default text-sm ' +
                (i === selectedIndex ? 'active-bg md-text' : 'md-text hover-bg')
              }
              onClick={() => openFile(entry)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {(entry as any).isRecent ? (
                <Clock size={14} className="text-secondary shrink-0" />
              ) : (
                <FileCode size={14} className="text-secondary shrink-0" />
              )}
              <span className="truncate flex-1">{entry.rel}</span>
              {(entry as any).isRecent && (
                <button
                  className="p-0.5 rounded hover-bg text-secondary opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    store.claudeCode.removeRecentFile(entry.abs)
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
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

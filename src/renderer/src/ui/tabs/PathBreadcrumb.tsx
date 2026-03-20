import { observer } from 'mobx-react-lite'
import { useStore } from '@/store/store'
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'

export const PathBreadcrumb = observer(({ groupId }: { groupId: string }) => {
  const store = useStore()

  const group = store.centerTabs.findGroup(groupId)
  const tabs = store.centerTabs.getGroupTabs(groupId)
  const activeTabId = group?.activeTabId || null
  const activeTab = activeTabId ? tabs.find((t) => t.id === activeTabId) || null : null

  const segments = useMemo(() => {
    if (!activeTab || activeTab.type !== 'code-file' || !activeTab.filePath) return null

    let displayPath = activeTab.filePath

    // Try to show relative path from project root
    if (activeTab.projectId) {
      for (const g of store.claudeCode.groupedProjects) {
        const found = g.projects.find((p) => p.id === activeTab.projectId)
        if (found && displayPath.startsWith(found.path)) {
          displayPath = displayPath.slice(found.path.length)
          if (displayPath.startsWith('/')) displayPath = displayPath.slice(1)
          break
        }
      }
    }

    return displayPath.split('/').filter(Boolean)
  }, [activeTab, store.claudeCode.groupedProjects])

  if (!segments) return null

  return (
    <div
      className="flex items-center gap-0.5 text-xs text-secondary px-3 py-0.5 border-b border-theme overflow-x-auto shrink-0"
      style={{ background: 'var(--tab)' }}
    >
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-0.5 shrink-0">
          {i > 0 && <ChevronRight size={10} className="text-secondary opacity-50" />}
          <span className={i === segments.length - 1 ? 'md-text' : ''}>{seg}</span>
        </span>
      ))}
    </div>
  )
})

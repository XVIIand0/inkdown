import { observer } from 'mobx-react-lite'
import { useStore } from '@/store/store'
import { renderIconPreview } from './IconPicker'
import { Folder } from 'lucide-react'

export const ProjectBadge = observer(
  ({ projectId, hostId }: { projectId?: string | null; hostId?: string | null }) => {
    const store = useStore()
    if (!projectId) return null

    // Derive display name from path — same as Sidebar's ProjectItem
    let displayName = ''
    for (const group of store.claudeCode.groupedProjects) {
      if (hostId && group.hostId !== hostId) continue
      if (!hostId && group.hostId !== null) continue
      const found = group.projects.find((p) => p.id === projectId)
      if (found) {
        displayName = found.path.split(/[/\\]/).filter(Boolean).pop() || found.path
        break
      }
    }

    // Icon: same logic as Sidebar's ProjectIcon — default to yellow Folder
    const config = store.claudeCode.getProjectConfig(projectId)
    const icon = renderIconPreview(config.iconType, config.iconValue, 'sm')

    if (!displayName) return null

    return (
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs shrink-0"
        style={{ background: 'var(--md-bg-mute)' }}
      >
        {icon || <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500" />}
        <span className="truncate max-w-[150px] text-secondary">{displayName}</span>
      </div>
    )
  }
)

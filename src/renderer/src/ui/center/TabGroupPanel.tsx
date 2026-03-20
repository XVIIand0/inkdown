import { useCallback, useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useStore } from '@/store/store'
import { useTranslation } from 'react-i18next'
import { TabBar } from '../tabs/TabBar'
import { PathBreadcrumb } from '../tabs/PathBreadcrumb'
import { SessionView, SshTerminalView, LocalTerminalView } from '../claude-code/SessionView'
import { MindNoteEditor } from '../mind-note/MindNoteEditor'
import { CodeFileEditor } from '../code-editor/CodeFileEditor'
import { Bot } from 'lucide-react'
import { DropZone } from '@/store/tabs/types'
import { dragState } from '../tabs/drag-state'

function getDropZone(e: React.DragEvent, rect: DOMRect): DropZone {
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const w = rect.width
  const h = rect.height

  const edgeRatio = 0.25

  if (x < w * edgeRatio) return 'left'
  if (x > w * (1 - edgeRatio)) return 'right'
  if (y < h * edgeRatio) return 'top'
  if (y > h * (1 - edgeRatio)) return 'bottom'
  return 'center'
}

interface TabGroupPanelProps {
  groupId: string
}

export const TabGroupPanel = observer(({ groupId }: TabGroupPanelProps) => {
  const store = useStore()
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCountRef = useRef(0)

  const group = store.centerTabs.findGroup(groupId)
  const tabs = store.centerTabs.getGroupTabs(groupId)
  const activeTabId = group?.activeTabId || null
  const activeTab = activeTabId ? tabs.find((t) => t.id === activeTabId) || null : null
  const isFocused = store.centerTabs.state.focusedGroupId === groupId

  // Global dragend clears overlay — covers cases where drop is swallowed
  // by a child (TabBar stopPropagation) or drag is cancelled / leaves window.
  useEffect(() => {
    const clear = () => {
      dragCountRef.current = 0
      setIsDragOver(false)
      setDropZone(null)
    }
    document.addEventListener('dragend', clear)
    return () => document.removeEventListener('dragend', clear)
  }, [])

  const handleMouseDown = useCallback(() => {
    store.centerTabs.focusGroup(groupId)
  }, [store, groupId])

  // Allow split overlay on this panel?
  // - Different source group → always yes (cross-group split)
  // - Same source group with ≥2 tabs → yes (split one tab off)
  // - Same source group with 1 tab → no (nothing to split)
  const shouldShowOverlay = useCallback(() => {
    if (!dragState.sourceGroupId) return false
    if (dragState.sourceGroupId !== groupId) return true
    return (group?.tabIds.length ?? 0) >= 2
  }, [groupId, group])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCountRef.current++
    if (shouldShowOverlay()) {
      setIsDragOver(true)
    }
  }, [shouldShowOverlay])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!shouldShowOverlay()) return
    const rect = panelRef.current?.getBoundingClientRect()
    if (rect) {
      setDropZone(getDropZone(e, rect))
    }
  }, [shouldShowOverlay])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCountRef.current--
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0
      setIsDragOver(false)
      setDropZone(null)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragCountRef.current = 0
      setIsDragOver(false)
      setDropZone(null)

      const tabId = e.dataTransfer.getData('text/tab-id')
      if (!tabId) return

      const rect = panelRef.current?.getBoundingClientRect()
      if (!rect) return

      const zone = getDropZone(e, rect)

      // Content area only handles split (edge zones).
      // Merge (center) is handled by dropping tab-on-tab in TabBar.
      if (zone !== 'center') {
        store.centerTabs.moveTabToNewSplit(tabId, groupId, zone)
      }
    },
    [store, groupId]
  )

  const renderDropOverlay = () => {
    if (!isDragOver || !dropZone || dropZone === 'center') return null

    const overlayStyle: React.CSSProperties = {
      position: 'absolute',
      background: 'rgba(59, 130, 246, 0.15)',
      border: '2px solid var(--accent)',
      borderRadius: 4,
      zIndex: 10,
      pointerEvents: 'none',
      transition: 'all 0.15s ease'
    }

    switch (dropZone) {
      case 'left':
        return <div style={{ ...overlayStyle, top: 0, left: 0, bottom: 0, width: '50%' }} />
      case 'right':
        return <div style={{ ...overlayStyle, top: 0, right: 0, bottom: 0, width: '50%' }} />
      case 'top':
        return <div style={{ ...overlayStyle, top: 0, left: 0, right: 0, height: '50%' }} />
      case 'bottom':
        return <div style={{ ...overlayStyle, bottom: 0, left: 0, right: 0, height: '50%' }} />
    }
  }

  return (
    <div
      ref={panelRef}
      className="flex flex-col h-full relative"
      style={{
        outline: isFocused ? '1px solid var(--accent)' : '1px solid transparent',
        outlineOffset: -1,
        boxShadow: activeTab?.borderColor
          ? `inset 0 0 0 2px ${activeTab.borderColor}`
          : undefined
      }}
      onMouseDown={handleMouseDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <TabBar groupId={groupId} />
      {activeTab?.type === 'code-file' && <PathBreadcrumb groupId={groupId} />}
      <div className="flex-1 overflow-hidden">
        {!activeTab && (
          <div className="flex-1 flex items-center justify-center h-full text-secondary">
            <div className="text-center space-y-3">
              <Bot size={48} className="mx-auto opacity-40" />
              <p className="text-sm">{t('tabs.noOpenTabs')}</p>
            </div>
          </div>
        )}
        {activeTab?.type === 'session' && (
          <SessionView
            sessionId={activeTab.sessionId}
            projectId={activeTab.projectId}
            hostId={activeTab.hostId}
          />
        )}
        {activeTab?.type === 'mind-note' && activeTab.noteId && (
          <MindNoteEditor noteId={activeTab.noteId} />
        )}
        {activeTab?.type === 'code-file' && activeTab.filePath && (
          <CodeFileEditor filePath={activeTab.filePath} />
        )}
        {activeTab?.type === 'ssh-terminal' && activeTab.hostId && (
          <SshTerminalView hostId={activeTab.hostId} />
        )}
        {activeTab?.type === 'local-terminal' && activeTab.filePath && (
          <LocalTerminalView projectPath={activeTab.filePath} initialCommand={activeTab.initialCommand} />
        )}
      </div>
      {renderDropOverlay()}
    </div>
  )
})

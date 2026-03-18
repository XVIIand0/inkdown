import { observer } from 'mobx-react-lite'
import { useCallback, useRef } from 'react'
import { useStore } from '@/store/store'
import { useLocalState } from '@/hooks/useLocalState'
import { useTranslation } from 'react-i18next'
import { X, MessageSquare, Brain, FileCode, Terminal, Folder } from 'lucide-react'
import React from 'react'
import { CenterTab } from '@/store/tabs/types'
import { openMenus, IMenu } from '@/ui/common/Menu'
import { renderIconPreview } from '../claude-code/IconPicker'
import { dragState } from './drag-state'

const TabIcon = ({ type }: { type: CenterTab['type'] }) => {
  switch (type) {
    case 'session':
      return <MessageSquare className={'w-3.5 h-3.5 shrink-0'} />
    case 'mind-note':
      return <Brain className={'w-3.5 h-3.5 shrink-0'} />
    case 'code-file':
      return <FileCode className={'w-3.5 h-3.5 shrink-0'} />
    case 'ssh-terminal':
      return <Terminal className={'w-3.5 h-3.5 shrink-0'} />
    case 'local-terminal':
      return <Terminal className={'w-3.5 h-3.5 shrink-0'} />
  }
}

const TabProjectTag = observer(({ projectId, hostId }: { projectId?: string; hostId?: string }) => {
  const store = useStore()
  if (!projectId) return null

  // Derive display name from path, same as Sidebar
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

  // Icon: same logic as Sidebar's ProjectIcon
  const config = store.claudeCode.getProjectConfig(projectId)
  const icon = renderIconPreview(config.iconType, config.iconValue, 'sm')

  if (!displayName) return null

  return (
    <div
      className="flex items-center gap-1 shrink-0 mr-1 px-1 rounded"
      style={{ background: 'var(--md-bg-mute)', fontSize: 10, lineHeight: '16px' }}
    >
      {icon || <Folder className="w-3 h-3 shrink-0 text-amber-500" />}
      <span className="truncate max-w-[60px] text-secondary">{displayName}</span>
    </div>
  )
})

interface TabBarProps {
  groupId?: string
}

export const TabBar = observer(({ groupId }: TabBarProps) => {
  const store = useStore()
  const { t } = useTranslation()

  // If groupId provided, use group-specific tabs; otherwise fallback to flat list
  const group = groupId ? store.centerTabs.findGroup(groupId) : null
  const tabs = group ? store.centerTabs.getGroupTabs(groupId!) : store.centerTabs.state.tabs
  const activeTabId = group ? group.activeTabId : store.centerTabs.state.activeTabId

  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useLocalState({
    dragIndex: -1,
    dragging: false,
    targetIndex: -1
  })

  const handleClose = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      store.centerTabs.closeTab(id)
    },
    [store]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (e.button === 1) {
        e.preventDefault()
        store.centerTabs.closeTab(id)
      }
    },
    [store]
  )

  const borderColorChoices = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'
  ]

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: CenterTab, index: number) => {
      e.preventDefault()
      e.stopPropagation()

      const colorChildren: IMenu[] = borderColorChoices.map((c) => ({
        icon: React.createElement('span', {
          style: { display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c }
        }),
        text: '',
        click: () => store.centerTabs.setTabBorderColor(tab.id, c)
      }))
      colorChildren.push({ hr: true })
      colorChildren.push({
        text: t('tabs.clearColor'),
        click: () => store.centerTabs.setTabBorderColor(tab.id, undefined)
      })

      const menus: IMenu[] = [
        {
          text: t('tabs.close'),
          click: () => store.centerTabs.closeTab(tab.id)
        },
        {
          text: t('tabs.closeOthers'),
          disabled: tabs.length <= 1,
          click: () => store.centerTabs.closeOtherTabs(tab.id)
        },
        {
          text: t('tabs.closeRight'),
          disabled: index >= tabs.length - 1,
          click: () => store.centerTabs.closeTabsToTheRight(tab.id)
        },
        { hr: true },
        {
          text: t('tabs.borderColor'),
          children: colorChildren
        },
        { hr: true },
        {
          text: t('tabs.splitRight'),
          click: () => {
            const gid = groupId || store.centerTabs.state.focusedGroupId
            const newGid = store.centerTabs.splitGroup(gid, 'horizontal', 'after')
            if (newGid) store.centerTabs.moveTabToGroup(tab.id, newGid)
          }
        },
        {
          text: t('tabs.splitDown'),
          click: () => {
            const gid = groupId || store.centerTabs.state.focusedGroupId
            const newGid = store.centerTabs.splitGroup(gid, 'vertical', 'after')
            if (newGid) store.centerTabs.moveTabToGroup(tab.id, newGid)
          }
        },
        { hr: true },
        {
          text: t('tabs.closeAll'),
          click: () => store.centerTabs.closeAllTabs()
        }
      ]
      openMenus(e, menus)
    },
    [store, tabs, t, groupId]
  )

  if (tabs.length === 0) return null

  return (
    <div
      ref={containerRef}
      className={
        'flex items-stretch h-9 border-b border-theme ' +
        'overflow-x-auto shrink-0'
      }
      style={{ scrollbarWidth: 'thin', background: 'var(--tab)' }}
    >
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            draggable={true}
            onDragStart={(e) => {
              const srcGroup = groupId || store.centerTabs.state.focusedGroupId
              setState({ dragging: true, dragIndex: i, targetIndex: -1 })
              e.dataTransfer.setData('text/tab-id', tab.id)
              e.dataTransfer.setData('text/source-group-id', srcGroup)
              e.dataTransfer.effectAllowed = 'move'
              dragState.tabId = tab.id
              dragState.sourceGroupId = srcGroup
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setState({ targetIndex: i })
            }}
            onDrop={(e) => {
              e.stopPropagation()
              const dragTabId = e.dataTransfer.getData('text/tab-id')
              const sourceGroupId = e.dataTransfer.getData('text/source-group-id')
              if (!dragTabId) return

              const thisGroupId = groupId || store.centerTabs.state.focusedGroupId

              if (sourceGroupId === thisGroupId) {
                // Same group: reorder
                if (state.targetIndex >= 0 && state.dragIndex !== state.targetIndex) {
                  if (groupId) {
                    store.centerTabs.moveTabInGroup(groupId, state.dragIndex, state.targetIndex)
                  } else {
                    store.centerTabs.moveTab(state.dragIndex, state.targetIndex)
                  }
                }
              } else if (groupId) {
                // Different group: merge — move tab into this group (at drop position)
                store.centerTabs.moveTabToGroup(dragTabId, groupId, i)
              }
            }}
            onDragEnd={() => {
              setState({ dragging: false, targetIndex: -1, dragIndex: -1 })
              dragState.tabId = null
              dragState.sourceGroupId = null
            }}
            onClick={() => {
              if (groupId) {
                store.centerTabs.selectTabInGroup(groupId, tab.id)
              } else {
                store.centerTabs.selectTab(tab.id)
              }
              if (tab.attention) store.centerTabs.setTabAttention(tab.id, false)
            }}
            onMouseDown={(e) => handleMouseDown(e, tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab, i)}
            className={
              'flex items-center gap-1.5 px-3 min-w-[120px] max-w-[240px] cursor-default ' +
              'text-xs select-none group relative border-r border-theme ' +
              (isActive
                ? 'primary-bg-color md-text'
                : 'text-secondary hover-bg')
            }
            style={tab.borderColor ? {
              boxShadow: `inset 0 -2px 0 ${tab.borderColor}`
            } : undefined}
          >
            <TabProjectTag projectId={tab.projectId} hostId={tab.hostId} />
            <TabIcon type={tab.type} />
            <span className={'truncate flex-1'}>{tab.title || 'Untitled'}</span>
            {tab.attention && (
              <span className={'w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse'} />
            )}
            {tab.type === 'code-file' && tab.dirty && (
              <span className={'w-2 h-2 rounded-full bg-blue-500 shrink-0'} />
            )}
            <div
              className={
                'opacity-0 group-hover:opacity-100 p-0.5 rounded ' +
                'hover-bg shrink-0 transition-opacity'
              }
              onClick={(e) => handleClose(e, tab.id)}
            >
              <X className={'w-3 h-3'} />
            </div>
          </div>
        )
      })}
    </div>
  )
})

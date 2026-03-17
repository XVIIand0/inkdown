import { observer } from 'mobx-react-lite'
import { useCallback, useRef } from 'react'
import { useStore } from '@/store/store'
import { useLocalState } from '@/hooks/useLocalState'
import { useTranslation } from 'react-i18next'
import { X, MessageSquare, Brain, FileCode, Terminal } from 'lucide-react'
import { CenterTab } from '@/store/tabs/types'
import { openMenus, IMenu } from '@/ui/common/Menu'

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
  }
}

export const TabBar = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const tabs = store.centerTabs.state.tabs
  const activeTabId = store.centerTabs.state.activeTabId
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

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: CenterTab, index: number) => {
      e.preventDefault()
      e.stopPropagation()
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
          text: t('tabs.closeAll'),
          click: () => store.centerTabs.closeAllTabs()
        }
      ]
      openMenus(e, menus)
    },
    [store, tabs, t]
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
            onDragStart={() => setState({ dragging: true, dragIndex: i, targetIndex: -1 })}
            onDragOver={(e) => {
              e.preventDefault()
              setState({ targetIndex: i })
            }}
            onDrop={() => {
              if (state.targetIndex >= 0 && state.dragIndex !== state.targetIndex) {
                store.centerTabs.moveTab(state.dragIndex, state.targetIndex)
              }
            }}
            onDragEnd={() => setState({ dragging: false, targetIndex: -1, dragIndex: -1 })}
            onClick={() => {
              store.centerTabs.selectTab(tab.id)
              if (tab.attention) store.centerTabs.setTabAttention(tab.id, false)
            }}
            onMouseDown={(e) => handleMouseDown(e, tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab, i)}
            className={
              'flex items-center gap-1.5 px-3 min-w-[120px] max-w-[200px] cursor-default ' +
              'text-xs select-none group relative border-r border-theme ' +
              (isActive
                ? 'primary-bg-color md-text'
                : 'text-secondary hover-bg')
            }
          >
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

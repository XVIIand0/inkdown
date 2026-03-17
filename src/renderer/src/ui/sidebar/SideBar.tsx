import { useStore } from '@/store/store'
import { useCallback, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { Tree } from './tree/Tree'
import { Terminal, PenLine, RefreshCw, Settings2 } from 'lucide-react'
import { os } from '@/utils/common'
import { ClaudeCodeSidebar } from '../claude-code/Sidebar'

export const SideBar = observer(() => {
  const store = useStore()
  const { sidePanelWidth, foldSideBar: fold, claudeCodeMode } = store.settings.state

  useEffect(() => {
    if (claudeCodeMode) {
      store.claudeCode.loadProjects()
    }
  }, [claudeCodeMode])

  const move = useCallback((e: React.MouseEvent) => {
    const startX = e.clientX
    document.body.classList.add('drag-sidebar')
    const startWidth = store.settings.state.sidePanelWidth
    const move = (e: MouseEvent) => {
      let width = startWidth + e.clientX - startX
      if (width > 500) {
        width = 500
      }
      if (width < 200) {
        width = 200
      }
      store.settings.setState({ sidePanelWidth: width })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener(
      'mouseup',
      () => {
        document.body.classList.remove('drag-sidebar')
        store.settings.setSetting('sidePanelWidth', store.settings.state.sidePanelWidth)
        window.removeEventListener('mousemove', move)
      },
      { once: true }
    )
  }, [])

  const handleToggleMode = useCallback(() => {
    if (claudeCodeMode) {
      store.settings.setSetting('claudeCodeMode', false)
    } else {
      store.claudeCode.enterClaudeCodeMode()
    }
  }, [claudeCodeMode, store])

  return (
    <div
      className={
        'border-r dark:border-white/10 border-black/10 bg-sidebar pt-10 overflow-hidden side-move-transition flex flex-col h-full md-text'
      }
      style={{ width: fold ? 0 : sidePanelWidth, paddingTop: os() === 'mac' ? 40 : 6 }}
    >
      <div
        className={'fixed w-1 h-screen top-0 z-10 cursor-col-resize'}
        style={{
          left: sidePanelWidth - 2
        }}
        onMouseDown={move}
      />
      <div className={'flex items-center justify-end gap-1 px-2 pb-1 shrink-0'}>
        {claudeCodeMode && (
          <button
            className={'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors text-secondary hover-bg'}
            onClick={() => store.settings.setData((data) => { data.open = true })}
            title="Settings"
          >
            <Settings2 className={'w-3.5 h-3.5'} />
          </button>
        )}
        {claudeCodeMode && (
          <button
            className={'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors text-secondary hover-bg'}
            onClick={() => store.claudeCode.scanAndShowImportDialog()}
            title="Re-scan projects"
          >
            <RefreshCw className={'w-3.5 h-3.5'} />
          </button>
        )}
        <button
          className={
            'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ' +
            (claudeCodeMode
              ? 'active-item-bg active-item-text'
              : 'text-secondary hover-bg')
          }
          onClick={handleToggleMode}
          title={claudeCodeMode ? 'Switch to Editor' : 'Switch to Claude Code'}
        >
          {claudeCodeMode ? (
            <PenLine className={'w-3.5 h-3.5'} />
          ) : (
            <Terminal className={'w-3.5 h-3.5'} />
          )}
        </button>
      </div>
      <div style={{ width: sidePanelWidth }} className={'flex-1 flex-shrink-0 min-h-0'}>
        <div className={`h-full`}>
          {claudeCodeMode ? <ClaudeCodeSidebar /> : <Tree />}
        </div>
      </div>
    </div>
  )
})

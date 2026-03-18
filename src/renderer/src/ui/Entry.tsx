import { useState } from 'react'
import { useStore } from '@/store/store'
import { SideBar } from './sidebar/SideBar'
import { Nav } from './Nav'
import { Chat } from './chat/Chat'
import { observer } from 'mobx-react-lite'
import { ConfirmDialog } from './dialog/ConfirmDialog'
import { EditFolderDialog } from './sidebar/tree/EditFolderDialog'
import { EditSpace } from './space/EditSpace'
import { Note } from '@/editor/Note'
import { Settings } from './settings/Settings'
import { ExportSpace } from './space/ExportSpace'
import { ImportFolder } from './space/ImportFolder'
import { SpaceFiles } from './space/Files'
import { CenterArea } from './center/CenterArea'
import { ClaudeCodeImportDialog } from './claude-code/ImportDialog'
import { SshHostDialog } from './claude-code/SshHostDialog'
import { RemoteImportDialog } from './claude-code/RemoteImportDialog'
import { FileFinder } from './claude-code/FileFinder'
const Entry = observer(() => {
  const store = useStore()
  const claudeCodeMode = store.settings.state.claudeCodeMode
  const [focusedPanel, setFocusedPanel] = useState<'sidebar' | 'center' | null>(null)
  const focusBorder = '2px solid var(--accent)'
  const noBorder = '2px solid transparent'
  return (
    <div className={`flex h-screen`}>
      <div
        className={`sidebar flex-shrink-0  ${!store.settings.state.fullChatBot ? '' : 'invisible opacity-0 w-0 h-0 absolute left-0 top-0 pointer-events-none'}`}
        style={claudeCodeMode ? { borderRight: focusedPanel === 'sidebar' ? focusBorder : noBorder } : undefined}
        onMouseDown={() => claudeCodeMode && setFocusedPanel('sidebar')}
      >
        <SideBar />
      </div>
      <div
        className={`flex-1 flex flex-col w-0 min-w-0 ${!store.settings.state.fullChatBot ? 'relative' : 'invisible opacity-0 w-0 h-0 absolute left-0 top-0 pointer-events-none'}`}
        style={claudeCodeMode ? { border: focusedPanel === 'center' ? focusBorder : noBorder } : undefined}
        onMouseDown={() => claudeCodeMode && setFocusedPanel('center')}
      >
        {!claudeCodeMode && <Nav />}
        <div className={'flex-1 relative h-[calc(100vh_-_40px)]'}>
          <div className={`h-full`}>
            {claudeCodeMode ? <CenterArea /> : <Note />}
          </div>
        </div>
      </div>
      {!claudeCodeMode && <Chat />}
      <ConfirmDialog />
      <EditFolderDialog />
      <EditSpace />
      <Settings />
      <ExportSpace />
      <ImportFolder />
      <SpaceFiles />
      <ClaudeCodeImportDialog />
      <SshHostDialog />
      <RemoteImportDialog />
      <FileFinder />
    </div>
  )
})

export default Entry

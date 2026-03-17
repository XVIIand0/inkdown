import { observer } from 'mobx-react-lite'
import { useStore } from '@/store/store'
import { useTranslation } from 'react-i18next'
import { TabBar } from '../tabs/TabBar'
import { SessionView } from '../claude-code/SessionView'
import { MindNoteEditor } from '../mind-note/MindNoteEditor'
import { CodeFileEditor } from '../code-editor/CodeFileEditor'
import { Bot } from 'lucide-react'

export const CenterArea = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const activeTab = store.centerTabs.activeTab

  return (
    <div className={'flex flex-col h-full'}>
      <TabBar />
      <div className={'flex-1 overflow-hidden'}>
        {!activeTab && (
          <div
            className={
              'flex-1 flex items-center justify-center h-full text-secondary'
            }
          >
            <div className={'text-center space-y-3'}>
              <Bot size={48} className={'mx-auto opacity-40'} />
              <p className={'text-sm'}>{t('tabs.noOpenTabs')}</p>
            </div>
          </div>
        )}
        {activeTab?.type === 'session' && (
          <SessionView
            sessionId={activeTab.sessionId}
            projectId={activeTab.projectId}
          />
        )}
        {activeTab?.type === 'mind-note' && activeTab.noteId && (
          <MindNoteEditor noteId={activeTab.noteId} />
        )}
        {activeTab?.type === 'code-file' && activeTab.filePath && (
          <CodeFileEditor filePath={activeTab.filePath} />
        )}
      </div>
    </div>
  )
})

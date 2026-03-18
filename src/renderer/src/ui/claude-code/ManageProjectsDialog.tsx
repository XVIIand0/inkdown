import { observer } from 'mobx-react-lite'
import { useStore } from '@/store/store'
import { useTranslation } from 'react-i18next'
import { Modal, Button } from 'antd'
import { Terminal, Server } from 'lucide-react'
import { ProjectSelectionList } from './ProjectSelectionList'

const ipcRenderer = window.electron.ipcRenderer

export const ManageProjectsDialog = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const dialog = store.claudeCode.dialog

  const hostId = dialog.manageHostId
  const hostName = dialog.manageHostName
  const isRemote = hostId !== null

  const TitleIcon = isRemote ? Server : Terminal

  return (
    <Modal
      open={dialog.showImportDialog}
      title={
        <div className={'flex items-center gap-2'}>
          <TitleIcon className={'w-4 h-4 text-blue-500'} />
          <span>{t('claudeCode.manageProjects')}</span>
          <span className={'text-xs text-secondary font-normal'}>— {hostName}</span>
        </div>
      }
      onCancel={() => store.claudeCode.closeManageDialog()}
      footer={
        <div className={'flex justify-end gap-2'}>
          <Button onClick={() => store.claudeCode.closeManageDialog()}>
            {t('cancel')}
          </Button>
          <Button
            type={'primary'}
            onClick={() => store.claudeCode.confirmManageProjects()}
          >
            {t('claudeCode.manageProjectsSave')}
          </Button>
        </div>
      }
      width={560}
      styles={{ body: { maxHeight: 450, overflowY: 'auto' } }}
      zIndex={2200}
    >
      <ProjectSelectionList
        allProjects={dialog.allProjects}
        selectedIds={dialog.selectedIds}
        displayNames={dialog.displayNames}
        scanning={dialog.scanning}
        isRemote={isRemote}
        onToggle={(id) => store.claudeCode.toggleImportSelection(id)}
        onToggleAll={() => store.claudeCode.toggleSelectAll()}
        onDisplayNameChange={(projectId, name) => store.claudeCode.setDisplayName(projectId, name)}
        onPathChange={(project, newPath) => {
          project.path = newPath
          ipcRenderer.invoke('claude-code:resolveProjectPath', project.id, newPath)
        }}
      />
    </Modal>
  )
})

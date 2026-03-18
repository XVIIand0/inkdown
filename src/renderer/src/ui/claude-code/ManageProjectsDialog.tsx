import { observer } from 'mobx-react-lite'
import { useStore } from '@/store/store'
import { useTranslation } from 'react-i18next'
import { Modal, Button, Checkbox, Spin, Select, Input } from 'antd'
import { Folder, Terminal, AlertTriangle, Server } from 'lucide-react'

const ipcRenderer = window.electron.ipcRenderer

export const ManageProjectsDialog = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const dialog = store.claudeCode.dialog

  const allProjects = dialog.allProjects
  const selectedIds = dialog.selectedIds
  const allSelected = allProjects.length > 0 && selectedIds.length === allProjects.length
  const hostId = dialog.manageHostId
  const hostName = dialog.manageHostName
  const isRemote = hostId !== null

  const handlePathChange = (project: IClaudeProject, newPath: string) => {
    project.path = newPath
    ipcRenderer.invoke('claude-code:resolveProjectPath', project.id, newPath)
  }

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
      {dialog.scanning ? (
        <div className={'flex items-center justify-center py-12'}>
          <Spin />
        </div>
      ) : allProjects.length === 0 ? (
        <div className={'text-center py-8 text-secondary'}>
          <TitleIcon className={'w-10 h-10 mx-auto mb-3 opacity-30'} />
          <p>{isRemote ? t('sshHost.remoteImportNone') : t('claudeCode.importNone')}</p>
        </div>
      ) : (
        <div>
          <p className={'text-sm text-secondary mb-3'}>
            {t('claudeCode.manageProjectsDesc', { count: allProjects.length })}
          </p>
          <div className={'mb-2 pb-2 border-b border-theme'}>
            <Checkbox
              checked={allSelected}
              indeterminate={selectedIds.length > 0 && !allSelected}
              onChange={() => store.claudeCode.toggleSelectAll()}
            >
              <span className={'text-sm'}>{t('claudeCode.importSelectAll')}</span>
            </Checkbox>
          </div>
          <div className={'space-y-1'}>
            {allProjects.map((project: IClaudeProject) => {
              const checked = selectedIds.includes(project.id)
              const folderName = project.path.split(/[/\\]/).filter(Boolean).pop() || project.path
              const hasAmbiguousPaths =
                !isRemote && project.candidatePaths && project.candidatePaths.length > 1
              const currentDisplayName = dialog.displayNames[project.id] || ''
              return (
                <div
                  key={project.id}
                  className={
                    'flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover-bg'
                  }
                  onClick={() => store.claudeCode.toggleImportSelection(project.id)}
                >
                  <Checkbox checked={checked} />
                  <Folder className={'w-4 h-4 text-amber-500 shrink-0'} />
                  <div className={'flex-1 min-w-0'}>
                    <div className={'flex items-center gap-2'}>
                      <Input
                        size={'small'}
                        value={currentDisplayName}
                        onChange={(e) => store.claudeCode.setDisplayName(project.id, e.target.value)}
                        placeholder={folderName}
                        onClick={(e) => e.stopPropagation()}
                        className={'flex-1'}
                        style={{ fontSize: 12 }}
                      />
                    </div>
                    {hasAmbiguousPaths ? (
                      <div
                        className={'flex items-center gap-1 mt-0.5'}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <AlertTriangle className={'w-3 h-3 text-amber-500 shrink-0'} />
                        <Select
                          size={'small'}
                          value={project.path}
                          onChange={(val) => handlePathChange(project, val)}
                          className={'flex-1 min-w-0'}
                          style={{ fontSize: 11 }}
                          popupMatchSelectWidth={false}
                          options={project.candidatePaths!.map((p) => ({
                            label: p,
                            value: p
                          }))}
                        />
                      </div>
                    ) : (
                      <div className={'text-xs text-secondary truncate mt-0.5'}>
                        {project.path}
                      </div>
                    )}
                  </div>
                  {project.sessionCount > 0 && (
                    <span className={'text-xs text-secondary shrink-0'}>
                      {t('claudeCode.messageCount', { count: project.sessionCount })}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
})

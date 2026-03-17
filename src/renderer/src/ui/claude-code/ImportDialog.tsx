import { observer } from 'mobx-react-lite'
import { useStore } from '@/store/store'
import { useTranslation } from 'react-i18next'
import { Modal, Button, Checkbox, Spin, Select } from 'antd'
import { Folder, Terminal, AlertTriangle } from 'lucide-react'

const ipcRenderer = window.electron.ipcRenderer

export const ClaudeCodeImportDialog = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const dialog = store.claudeCode.dialog

  const allProjects = dialog.allProjects
  const selectedIds = dialog.selectedIds
  const allSelected = allProjects.length > 0 && selectedIds.length === allProjects.length

  const handlePathChange = (project: IClaudeProject, newPath: string) => {
    project.path = newPath
    ipcRenderer.invoke('claude-code:resolveProjectPath', project.id, newPath)
  }

  return (
    <Modal
      open={dialog.showImportDialog}
      title={
        <div className={'flex items-center gap-2'}>
          <Terminal className={'w-4 h-4 text-blue-500'} />
          <span>{t('claudeCode.importTitle')}</span>
        </div>
      }
      onCancel={() => store.claudeCode.closeImportDialog()}
      footer={
        <div className={'flex justify-end gap-2'}>
          <Button onClick={() => store.claudeCode.closeImportDialog()}>
            {t('cancel')}
          </Button>
          <Button
            type={'primary'}
            disabled={selectedIds.length === 0}
            onClick={() => store.claudeCode.confirmImport()}
          >
            {t('claudeCode.importBtn')}
          </Button>
        </div>
      }
      width={520}
      styles={{ body: { maxHeight: 400, overflowY: 'auto' } }}
      zIndex={2200}
    >
      {dialog.scanning ? (
        <div className={'flex items-center justify-center py-12'}>
          <Spin />
        </div>
      ) : allProjects.length === 0 ? (
        <div className={'text-center py-8 text-secondary'}>
          <Terminal className={'w-10 h-10 mx-auto mb-3 opacity-30'} />
          <p>{t('claudeCode.importNone')}</p>
        </div>
      ) : (
        <div>
          <p className={'text-sm text-secondary mb-3'}>
            {t('claudeCode.importDesc', { count: allProjects.length })}
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
              const displayName = project.path.split(/[/\\]/).filter(Boolean).pop() || project.path
              const hasAmbiguousPaths =
                project.candidatePaths && project.candidatePaths.length > 1
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
                    <div className={'text-sm truncate'}>{displayName}</div>
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
                      <div className={'text-xs text-secondary truncate'}>
                        {project.path}
                      </div>
                    )}
                  </div>
                  <span className={'text-xs text-secondary shrink-0'}>
                    {t('claudeCode.messageCount', { count: project.sessionCount })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
})

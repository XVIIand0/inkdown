import { observer } from 'mobx-react-lite'
import { useStore } from '@/store/store'
import { useTranslation } from 'react-i18next'
import { Modal, Button, Checkbox, Spin } from 'antd'
import { Folder, Server } from 'lucide-react'

export const RemoteImportDialog = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const dialog = store.sshHost.dialog

  const allProjects = dialog.remoteAllProjects
  const selectedIds = dialog.remoteSelectedIds
  const allSelected = allProjects.length > 0 && selectedIds.length === allProjects.length
  const host = dialog.importHostId
    ? store.sshHost.state.hosts.find((h) => h.id === dialog.importHostId)
    : null
  const hostName = host?.name || host?.hostname || ''

  return (
    <Modal
      open={dialog.showRemoteImportDialog}
      title={
        <div className={'flex items-center gap-2'}>
          <Server className={'w-4 h-4 text-blue-500'} />
          <span>{t('sshHost.remoteImportTitle')}</span>
        </div>
      }
      onCancel={() => store.sshHost.closeRemoteImportDialog()}
      footer={
        <div className={'flex justify-end gap-2'}>
          <Button onClick={() => store.sshHost.closeRemoteImportDialog()}>
            {t('cancel')}
          </Button>
          <Button
            type={'primary'}
            disabled={selectedIds.length === 0}
            onClick={() => store.sshHost.confirmRemoteImport()}
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
        <div className={'flex flex-col items-center justify-center py-12'}>
          <Spin />
          <p className={'text-sm text-secondary mt-3'}>
            {t('sshHost.remoteImportDesc', { count: '...', host: hostName })}
          </p>
        </div>
      ) : allProjects.length === 0 ? (
        <div className={'text-center py-8 text-secondary'}>
          <Server className={'w-10 h-10 mx-auto mb-3 opacity-30'} />
          <p>{t('sshHost.remoteImportNone')}</p>
        </div>
      ) : (
        <div>
          <p className={'text-sm text-secondary mb-3'}>
            {t('sshHost.remoteImportDesc', { count: allProjects.length, host: hostName })}
          </p>
          <div className={'mb-2 pb-2 border-b border-theme'}>
            <Checkbox
              checked={allSelected}
              indeterminate={selectedIds.length > 0 && !allSelected}
              onChange={() => store.sshHost.toggleRemoteSelectAll()}
            >
              <span className={'text-sm'}>{t('claudeCode.importSelectAll')}</span>
            </Checkbox>
          </div>
          <div className={'space-y-1'}>
            {allProjects.map((project: any) => {
              const checked = selectedIds.includes(project.id)
              const displayName = project.path.split(/[/\\]/).filter(Boolean).pop() || project.path
              return (
                <div
                  key={project.id}
                  className={
                    'flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer ' +
                    'hover-bg'
                  }
                  onClick={() => store.sshHost.toggleRemoteImportSelection(project.id)}
                >
                  <Checkbox checked={checked} />
                  <Folder className={'w-4 h-4 text-amber-500 shrink-0'} />
                  <div className={'flex-1 min-w-0'}>
                    <div className={'text-sm truncate'}>{displayName}</div>
                    <div className={'text-xs text-secondary truncate'}>
                      {project.path}
                    </div>
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

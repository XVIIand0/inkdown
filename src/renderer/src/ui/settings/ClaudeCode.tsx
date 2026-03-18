import { observer } from 'mobx-react-lite'
import { Button } from 'antd'
import { useStore } from '@/store/store'
import { useTranslation } from 'react-i18next'
import { Monitor, Server } from 'lucide-react'

export const ClaudeCodeSettings = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const imported = store.settings.state.claudeCodeImportedProjects
  const importedMap =
    typeof imported === 'object' && !Array.isArray(imported)
      ? (imported as Record<string, string[]>)
      : {}
  const localCount = (Array.isArray(imported) ? imported : importedMap.local || []).length
  const hosts = store.sshHost.state.hosts

  return (
    <div className={'divide-y divide-gray-200 dark:divide-gray-200/10 px-2'}>
      <div className={'flex justify-between items-center py-3'}>
        <div className={'text-sm flex items-center gap-1.5'}>
          <Monitor className={'w-4 h-4 text-blue-500'} />
          <span>{t('sshHost.local')}</span>
          {localCount > 0 && (
            <span className={'text-xs text-gray-400 ml-1'}>
              ({t('claudeCode.imported', { count: localCount })})
            </span>
          )}
        </div>
        <Button
          size={'small'}
          onClick={() => store.claudeCode.openManageProjectsDialog(null)}
        >
          {t('claudeCode.manageProjects')}
        </Button>
      </div>
      {hosts.map((host: ISshHost) => {
        const hostProjects = importedMap[host.id] || []
        return (
          <div key={host.id} className={'flex justify-between items-center py-3'}>
            <div className={'text-sm flex items-center gap-1.5'}>
              <Server className={'w-4 h-4 text-blue-500'} />
              <span>{host.name}</span>
              {hostProjects.length > 0 && (
                <span className={'text-xs text-gray-400 ml-1'}>
                  ({t('claudeCode.imported', { count: hostProjects.length })})
                </span>
              )}
            </div>
            <Button
              size={'small'}
              onClick={() => store.sshHost.openHostDialog(host, 'claude-code')}
            >
              {t('claudeCode.manageProjects')}
            </Button>
          </div>
        )
      })}
    </div>
  )
})

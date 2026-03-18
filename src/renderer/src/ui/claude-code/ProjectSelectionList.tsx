import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { Checkbox, Spin, Select, Input } from 'antd'
import { Folder, AlertTriangle, Server, Terminal } from 'lucide-react'

const ipcRenderer = window.electron.ipcRenderer

interface ProjectSelectionListProps {
  allProjects: IClaudeProject[]
  selectedIds: string[]
  displayNames: Record<string, string>
  scanning: boolean
  isRemote: boolean
  onToggle: (id: string) => void
  onToggleAll: () => void
  onDisplayNameChange: (projectId: string, name: string) => void
  onPathChange?: (project: IClaudeProject, newPath: string) => void
}

export const ProjectSelectionList = observer(
  ({
    allProjects,
    selectedIds,
    displayNames,
    scanning,
    isRemote,
    onToggle,
    onToggleAll,
    onDisplayNameChange,
    onPathChange
  }: ProjectSelectionListProps) => {
    const { t } = useTranslation()
    const allSelected = allProjects.length > 0 && selectedIds.length === allProjects.length
    const TitleIcon = isRemote ? Server : Terminal

    const handlePathChange = (project: IClaudeProject, newPath: string) => {
      if (onPathChange) {
        onPathChange(project, newPath)
      } else {
        project.path = newPath
        ipcRenderer.invoke('claude-code:resolveProjectPath', project.id, newPath)
      }
    }

    if (scanning) {
      return (
        <div className={'flex items-center justify-center py-12'}>
          <Spin />
        </div>
      )
    }

    if (allProjects.length === 0) {
      return (
        <div className={'text-center py-8 text-secondary'}>
          <TitleIcon className={'w-10 h-10 mx-auto mb-3 opacity-30'} />
          <p>{isRemote ? t('sshHost.remoteImportNone') : t('claudeCode.importNone')}</p>
        </div>
      )
    }

    return (
      <div>
        <p className={'text-sm text-secondary mb-3'}>
          {t('claudeCode.manageProjectsDesc', { count: allProjects.length })}
        </p>
        <div className={'mb-2 pb-2 border-b border-theme'}>
          <Checkbox
            checked={allSelected}
            indeterminate={selectedIds.length > 0 && !allSelected}
            onChange={() => onToggleAll()}
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
            const currentDisplayName = displayNames[project.id] || ''
            return (
              <div
                key={project.id}
                className={
                  'flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover-bg'
                }
                onClick={() => onToggle(project.id)}
              >
                <Checkbox checked={checked} />
                <Folder className={'w-4 h-4 text-amber-500 shrink-0'} />
                <div className={'flex-1 min-w-0'}>
                  <div className={'flex items-center gap-2'}>
                    <Input
                      size={'small'}
                      value={currentDisplayName}
                      onChange={(e) => onDisplayNameChange(project.id, e.target.value)}
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
                    {project.sessionCount}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)

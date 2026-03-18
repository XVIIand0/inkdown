import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useStore } from '@/store/store'
import { useState, useEffect } from 'react'
import { Modal } from 'antd'
import { IconPicker, IconType } from './IconPicker'

interface CustomizeTarget {
  type: 'project' | 'local-host'
  projectId?: string
  name: string
  path?: string
  iconType: IconType
  iconValue: string
}

// Global dialog state
let _dialogState: {
  show: boolean
  target: CustomizeTarget | null
  setShow: (v: boolean) => void
  setTarget: (v: CustomizeTarget | null) => void
} | null = null

export function openCustomizeDialog(target: CustomizeTarget) {
  if (_dialogState) {
    _dialogState.setTarget(target)
    _dialogState.setShow(true)
  }
}

export const CustomizeDialog = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const [show, setShow] = useState(false)
  const [target, setTarget] = useState<CustomizeTarget | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [iconType, setIconType] = useState<IconType>('default')
  const [iconValue, setIconValue] = useState('')

  // Register global state
  useEffect(() => {
    _dialogState = { show, setShow, target, setTarget }
    return () => { _dialogState = null }
  })

  // Sync form state when target changes
  useEffect(() => {
    if (target) {
      setDisplayName(target.name === 'Local' && target.type === 'local-host' ? '' : target.name)
      setIconType(target.iconType)
      setIconValue(target.iconValue)
    }
  }, [target])

  const handleIconChange = (type: IconType, value: string) => {
    setIconType(type)
    setIconValue(value)
  }

  const handleSave = () => {
    if (!target) return

    if (target.type === 'project' && target.projectId) {
      store.claudeCode.setProjectConfig(target.projectId, {
        iconType: iconType === 'default' ? 'default' : iconType,
        iconValue: iconType === 'default' ? '' : iconValue,
        displayName: displayName.trim() || undefined
      })
    } else if (target.type === 'local-host') {
      store.settings.setSetting('claudeCodeLocalHost', {
        name: displayName.trim() || undefined,
        iconType: iconType === 'default' ? undefined : iconType,
        iconValue: iconType === 'default' ? undefined : iconValue
      })
    }

    setShow(false)
  }

  const handleCancel = () => {
    setShow(false)
  }

  const title = target?.type === 'project'
    ? t('claudeCode.projectSettings')
    : t('claudeCode.customize')

  const namePlaceholder = target?.type === 'local-host'
    ? 'Local'
    : (target?.path?.split(/[/\\]/).filter(Boolean).pop() || '')

  return (
    <Modal
      open={show}
      title={title}
      onOk={handleSave}
      onCancel={handleCancel}
      width={420}
      destroyOnClose
    >
      {target && (
        <div className="space-y-4 py-2">
          {/* Display name */}
          <div>
            <label className="block text-xs text-secondary mb-1">
              {t('claudeCode.displayNamePlaceholder')}
            </label>
            <input
              className="w-full text-sm py-1.5 px-2.5 rounded border border-theme primary-bg-color md-text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={namePlaceholder}
              autoFocus
            />
          </div>

          {/* Path (read-only, for project) */}
          {target.path && (
            <div>
              <label className="block text-xs text-secondary mb-1">Path</label>
              <div
                className="text-xs text-secondary py-1.5 px-2.5 rounded truncate"
                style={{ background: 'var(--md-bg-mute)' }}
                title={target.path}
              >
                {target.path}
              </div>
            </div>
          )}

          {/* Icon picker */}
          <div>
            <label className="block text-xs text-secondary mb-1">
              {t('claudeCode.projectSettings')}
            </label>
            <IconPicker
              iconType={iconType}
              iconValue={iconValue}
              onChange={handleIconChange}
            />
          </div>
        </div>
      )}
    </Modal>
  )
})

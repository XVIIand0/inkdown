import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#6b7280', '#78716c'
]

const PRESET_EMOJIS = [
  '🖥️', '🌐', '☁️', '🔧', '🚀', '⚡', '🎯', '📦',
  '🏠', '🏢', '🔒', '🔑', '💻', '📡', '🗄️', '🐳',
  '🧪', '🛠️', '📊', '🎨', '📁', '💎', '🔥', '⭐'
]

export type IconType = 'default' | 'color' | 'image' | 'emoji'

export function IconPicker({
  iconType,
  iconValue,
  onChange
}: {
  iconType: IconType
  iconValue: string
  onChange: (type: IconType, value: string) => void
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<IconType>(iconType === 'default' ? 'emoji' : iconType)

  const handleImageUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        onChange('image', reader.result as string)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const tabClass = (tab: IconType) =>
    'px-2 py-1 text-xs rounded transition-colors cursor-pointer ' +
    (activeTab === tab ? 'md-text' : 'text-secondary hover-bg')

  const tabStyle = (tab: IconType) =>
    activeTab === tab ? { background: 'var(--md-bg-mute)' } : undefined

  return (
    <div>
      <div className={'flex items-center gap-1 mb-2'}>
        <button className={tabClass('emoji')} style={tabStyle('emoji')} onClick={() => setActiveTab('emoji')}>
          {t('claudeCode.iconEmoji')}
        </button>
        <button className={tabClass('color')} style={tabStyle('color')} onClick={() => setActiveTab('color')}>
          {t('claudeCode.iconColor')}
        </button>
        <button className={tabClass('image')} style={tabStyle('image')} onClick={() => setActiveTab('image')}>
          {t('claudeCode.iconImage')}
        </button>
        {iconType !== 'default' && (
          <button
            className={'ml-auto text-xs text-secondary hover:text-current transition-colors cursor-pointer'}
            onClick={() => onChange('default', '')}
          >
            {t('claudeCode.resetIcon')}
          </button>
        )}
      </div>

      {activeTab === 'emoji' && (
        <div className={'flex flex-wrap gap-1'}>
          {PRESET_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className={
                'w-8 h-8 flex items-center justify-center rounded text-base ' +
                'hover-bg transition-colors ' +
                (iconType === 'emoji' && iconValue === emoji
                  ? 'ring-2 ring-blue-500'
                  : '')
              }
              onClick={() => onChange('emoji', emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'color' && (
        <div className={'flex items-center gap-2 flex-wrap'}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              className={
                'w-6 h-6 rounded-full border-2 transition-colors ' +
                (iconType === 'color' && iconValue === c ? 'border-blue-500' : 'border-transparent')
              }
              style={{ background: c }}
              onClick={() => onChange('color', c)}
            />
          ))}
          <input
            className={'w-20 text-xs py-1 px-2 rounded border border-theme primary-bg-color md-text'}
            value={iconType === 'color' ? iconValue : ''}
            onChange={(e) => onChange('color', e.target.value)}
            placeholder={'#hex'}
          />
        </div>
      )}

      {activeTab === 'image' && (
        <div className={'flex items-center gap-2'}>
          {iconType === 'image' && iconValue && (
            <img src={iconValue} className={'w-8 h-8 rounded object-cover'} />
          )}
          <button
            className={
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-theme ' +
              'md-text hover-bg transition-colors'
            }
            onClick={handleImageUpload}
          >
            <Upload size={14} />
            {t('claudeCode.browse')}
          </button>
        </div>
      )}
    </div>
  )
}

export function renderIconPreview(
  iconType: string,
  iconValue?: string,
  size: 'sm' | 'md' = 'sm'
) {
  const px = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5'
  if (iconType === 'emoji' && iconValue) {
    return <span className={`${px} flex items-center justify-center shrink-0 leading-none`} style={{ fontSize: size === 'sm' ? 12 : 16 }}>{iconValue}</span>
  }
  if (iconType === 'color' && iconValue) {
    return <span className={`${px} rounded-sm shrink-0`} style={{ background: iconValue }} />
  }
  if (iconType === 'image' && iconValue) {
    return <img src={iconValue} className={`${px} rounded-sm shrink-0 object-cover`} />
  }
  return null
}

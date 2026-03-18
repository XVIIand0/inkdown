import { createElement, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Upload,
  Monitor, Server, Terminal, Globe, Cloud, Cpu, Database, HardDrive,
  Folder, FolderOpen, FileCode, FileText, File, Archive, Package,
  Lock, Key, Shield, ShieldCheck, Eye, EyeOff,
  Rocket, Zap, Target, Flame, Star, Gem, Lightbulb, Sparkles,
  Wrench, Settings, Cog, Hammer, PenTool, Brush, Palette,
  Code, CodeXml, Braces, Hash, Binary, GitBranch, GitFork, GitMerge,
  Home, Building, Building2, Factory, Landmark, Castle,
  Bug, TestTube, FlaskConical, Microscope, Dna, Atom,
  BarChart, PieChart, LineChart, TrendingUp, Activity, Gauge,
  MessageSquare, Mail, Send, Bell, Megaphone,
  Play, Circle, Square, Triangle, Hexagon, Pentagon, Octagon, Diamond,
  Heart, Music, Camera, Gamepad2, Trophy, Crown,
  Anchor, Compass, Map, Navigation, Plane, Ship,
  Coffee, Beer, Apple, Cherry, Leaf, TreePine, Flower2, Sun, Moon,
  Cat, Dog, Fish, Bird, Rabbit
} from 'lucide-react'

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#6b7280', '#78716c'
]

const PRESET_EMOJIS = [
  // Devices & Tech
  '🖥️', '💻', '📱', '⌨️', '🖱️', '🖨️', '💾', '📀',
  // Network & Cloud
  '🌐', '☁️', '📡', '🔗', '📶', '🛰️', '🌍', '🌏',
  // Dev & Tools
  '🔧', '🛠️', '⚙️', '🧰', '🔩', '🪛', '🔨', '⛏️',
  // Symbols
  '🚀', '⚡', '🎯', '🔥', '⭐', '💎', '💡', '🧲',
  // Files & Storage
  '📦', '📁', '📂', '🗄️', '🗃️', '📋', '📝', '📄',
  // Buildings
  '🏠', '🏢', '🏗️', '🏭', '🏛️', '🏰', '🏫', '⛪',
  // Security
  '🔒', '🔑', '🛡️', '🔐', '🔓', '🗝️', '🚨', '🔔',
  // Science & Lab
  '🧪', '🔬', '🧬', '🔭', '🧫', '⚗️', '🧮', '📐',
  // Data & Charts
  '📊', '📈', '📉', '🗂️', '🗺️', '📏', '🔢', '💹',
  // Creative
  '🎨', '✏️', '🖌️', '🖍️', '🎭', '🎪', '🎬', '🎵',
  // Animals & Nature
  '🐳', '🐙', '🦊', '🐧', '🦀', '🐝', '🦋', '🐍',
  // Objects
  '☕', '🍺', '🧊', '🎮', '🕹️', '🎲', '🏆', '🎖️',
  // Misc
  '💜', '💙', '💚', '💛', '🧡', '❤️', '🤍', '🖤'
]

// Lucide icon registry: name → component
const LUCIDE_ICONS: Record<string, any> = {
  // Devices & Tech
  Monitor, Server, Terminal, Cpu, Database, HardDrive,
  // Network
  Globe, Cloud,
  // Files
  Folder, FolderOpen, FileCode, FileText, File, Archive, Package,
  // Security
  Lock, Key, Shield, ShieldCheck, Eye, EyeOff,
  // Symbols
  Rocket, Zap, Target, Flame, Star, Gem, Lightbulb, Sparkles,
  // Tools
  Wrench, Settings, Cog, Hammer, PenTool, Brush, Palette,
  // Code
  Code, CodeXml, Braces, Hash, Binary, GitBranch, GitFork, GitMerge,
  // Buildings
  Home, Building, Building2, Factory, Landmark, Castle,
  // Science
  Bug, TestTube, FlaskConical, Microscope, Dna, Atom,
  // Data
  BarChart, PieChart, LineChart, TrendingUp, Activity, Gauge,
  // Communication
  MessageSquare, Mail, Send, Bell, Megaphone,
  // Shapes
  Play, Circle, Square, Triangle, Hexagon, Pentagon, Octagon, Diamond,
  // Fun
  Heart, Music, Camera, Gamepad2, Trophy, Crown,
  // Travel
  Anchor, Compass, Map, Navigation, Plane, Ship,
  // Nature
  Coffee, Beer, Apple, Cherry, Leaf, TreePine, Flower2, Sun, Moon,
  Cat, Dog, Fish, Bird, Rabbit
}

const LUCIDE_ICON_NAMES = Object.keys(LUCIDE_ICONS)

export type IconType = 'default' | 'color' | 'image' | 'emoji' | 'lucide'

// Parse lucide value: "Terminal:#3b82f6"
function parseLucideValue(value: string): { name: string; color: string } {
  const idx = value.indexOf(':')
  if (idx === -1) return { name: value, color: '#6b7280' }
  return { name: value.substring(0, idx), color: value.substring(idx + 1) }
}

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
  const [activeTab, setActiveTab] = useState<IconType>(
    iconType === 'default' ? 'lucide' : iconType
  )

  const currentLucide = iconType === 'lucide' ? parseLucideValue(iconValue) : { name: '', color: '#3b82f6' }
  const [lucideColor, setLucideColor] = useState(currentLucide.color)

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

  const handleLucideSelect = (name: string) => {
    onChange('lucide', `${name}:${lucideColor}`)
  }

  const handleLucideColorChange = (color: string) => {
    setLucideColor(color)
    if (iconType === 'lucide' && currentLucide.name) {
      onChange('lucide', `${currentLucide.name}:${color}`)
    }
  }

  const tabClass = (tab: IconType) =>
    'px-2 py-1 text-xs rounded transition-colors cursor-pointer ' +
    (activeTab === tab ? 'md-text' : 'text-secondary hover-bg')

  const tabStyle = (tab: IconType) =>
    activeTab === tab ? { background: 'var(--md-bg-mute)' } : undefined

  return (
    <div>
      <div className={'flex items-center gap-1 mb-2 flex-wrap'}>
        <button className={tabClass('lucide')} style={tabStyle('lucide')} onClick={() => setActiveTab('lucide')}>
          {t('claudeCode.iconLucide')}
        </button>
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

      {activeTab === 'lucide' && (
        <div>
          {/* Color picker row */}
          <div className={'flex items-center gap-1.5 mb-2 flex-wrap'}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                className={
                  'w-5 h-5 rounded-full border-2 transition-colors ' +
                  (lucideColor === c ? 'border-blue-500' : 'border-transparent')
                }
                style={{ background: c }}
                onClick={() => handleLucideColorChange(c)}
              />
            ))}
            <input
              className={'w-16 text-xs py-0.5 px-1.5 rounded border border-theme primary-bg-color md-text'}
              value={lucideColor}
              onChange={(e) => handleLucideColorChange(e.target.value)}
              placeholder={'#hex'}
            />
          </div>
          {/* Icon grid */}
          <div className={'flex flex-wrap gap-1 max-h-[200px] overflow-y-auto'}>
            {LUCIDE_ICON_NAMES.map((name) => (
              <button
                key={name}
                className={
                  'w-8 h-8 flex items-center justify-center rounded ' +
                  'hover-bg transition-colors ' +
                  (iconType === 'lucide' && currentLucide.name === name
                    ? 'ring-2 ring-blue-500'
                    : '')
                }
                onClick={() => handleLucideSelect(name)}
                title={name}
              >
                {createElement(LUCIDE_ICONS[name], { size: 16, style: { color: lucideColor } })}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'emoji' && (
        <div className={'flex flex-wrap gap-1 max-h-[200px] overflow-y-auto'}>
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
  const iconSize = size === 'sm' ? 14 : 20
  if (iconType === 'lucide' && iconValue) {
    const { name, color } = parseLucideValue(iconValue)
    const IconComp = LUCIDE_ICONS[name]
    if (IconComp) {
      return <span className={`${px} flex items-center justify-center shrink-0`}>
        {createElement(IconComp, { size: iconSize, style: { color } })}
      </span>
    }
  }
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

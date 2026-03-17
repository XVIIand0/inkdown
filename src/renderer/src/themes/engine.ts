import { themes } from './themes'

export function applyTheme(themeId: string, isDark: boolean) {
  const theme = themes.find((t) => t.id === themeId)
  if (!theme) return

  const colors = isDark ? theme.colors.dark : theme.colors.light
  const root = document.documentElement

  root.style.setProperty('--primary-bg-color', colors.primaryBg)
  root.style.setProperty('--side-panel-bg-color', colors.sidebarBg)
  root.style.setProperty('--nav', colors.navBg)
  root.style.setProperty('--tab', colors.tabBg)
  root.style.setProperty('--card-bg', colors.cardBg)
  root.style.setProperty('--md-code-bg', colors.codeBg)
  root.style.setProperty('--tree-bg', colors.treeBg)
  root.style.setProperty('--b1', colors.border)
  root.style.setProperty('--md-text', colors.text)
  root.style.setProperty('--md-bg-mute', colors.bgMute)
  root.style.setProperty('--md-high', colors.highlight)
  root.style.setProperty('--panel-bg', colors.panelBg)
  root.style.setProperty('--chat-bg', colors.chatBg)
  root.style.setProperty('--chat-user-message-bg-color', colors.userMsgBg)
  root.style.setProperty('--md-border', colors.border)
  root.style.setProperty('--accent', colors.accent)
  root.style.setProperty('--accent-hover', colors.accentHover)
  root.style.setProperty('--text-secondary', colors.textSecondary)
  root.style.setProperty('--hover-bg', colors.hoverBg)
  root.style.setProperty('--active-bg', colors.activeBg)
  root.style.setProperty('--active-text', colors.activeText)
}

export function clearTheme() {
  const root = document.documentElement
  const props = [
    '--primary-bg-color',
    '--side-panel-bg-color',
    '--nav',
    '--tab',
    '--card-bg',
    '--md-code-bg',
    '--tree-bg',
    '--b1',
    '--md-text',
    '--md-bg-mute',
    '--md-high',
    '--panel-bg',
    '--chat-bg',
    '--chat-user-message-bg-color',
    '--md-border',
    '--accent',
    '--accent-hover',
    '--text-secondary',
    '--hover-bg',
    '--active-bg',
    '--active-text'
  ]
  props.forEach((p) => root.style.removeProperty(p))
}

export function getTheme(id: string) {
  return themes.find((t) => t.id === id)
}

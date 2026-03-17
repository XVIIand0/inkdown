export interface ThemeColors {
  primaryBg: string
  sidebarBg: string
  navBg: string
  tabBg: string
  tabActiveBg: string
  cardBg: string
  panelBg: string
  chatBg: string
  codeBg: string
  treeBg: string
  border: string
  text: string
  textMuted: string
  textSecondary: string
  bgMute: string
  highlight: string
  accent: string
  accentHover: string
  hoverBg: string
  activeBg: string
  activeText: string
  userMsgBg: string
}

export interface ThemeDefinition {
  id: string
  name: string
  colors: {
    light: ThemeColors
    dark: ThemeColors
  }
}

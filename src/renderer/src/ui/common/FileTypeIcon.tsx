import {
  File,
  FileCode,
  FileText,
  FileImage,
  Braces,
  Settings,
  Hash,
  Database
} from 'lucide-react'
import React from 'react'

interface FileIconMapping {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>
  color: string
}

const extensionMap: Record<string, FileIconMapping> = {
  ts: { icon: FileCode, color: '#3178c6' },
  tsx: { icon: FileCode, color: '#3178c6' },
  js: { icon: FileCode, color: '#f7df1e' },
  jsx: { icon: FileCode, color: '#f7df1e' },
  py: { icon: FileCode, color: '#3572A5' },
  rs: { icon: FileCode, color: '#dea584' },
  go: { icon: FileCode, color: '#00ADD8' },
  json: { icon: Braces, color: '#cbcb41' },
  yaml: { icon: Settings, color: '#cb171e' },
  yml: { icon: Settings, color: '#cb171e' },
  toml: { icon: Settings, color: '#cb171e' },
  md: { icon: FileText, color: '#519aba' },
  html: { icon: FileCode, color: '#e34c26' },
  css: { icon: FileCode, color: '#563d7c' },
  scss: { icon: FileCode, color: '#c6538c' },
  less: { icon: FileCode, color: '#1d365d' },
  sh: { icon: Hash, color: '#89e051' },
  bash: { icon: Hash, color: '#89e051' },
  zsh: { icon: Hash, color: '#89e051' },
  sql: { icon: Database, color: '#e38c00' },
  png: { icon: FileImage, color: '#a074c4' },
  jpg: { icon: FileImage, color: '#a074c4' },
  jpeg: { icon: FileImage, color: '#a074c4' },
  gif: { icon: FileImage, color: '#a074c4' },
  svg: { icon: FileImage, color: '#a074c4' },
  webp: { icon: FileImage, color: '#a074c4' },
  c: { icon: FileCode, color: '#555555' },
  h: { icon: FileCode, color: '#555555' },
  cpp: { icon: FileCode, color: '#f34b7d' },
  hpp: { icon: FileCode, color: '#f34b7d' },
  java: { icon: FileCode, color: '#b07219' },
  kt: { icon: FileCode, color: '#A97BFF' },
  swift: { icon: FileCode, color: '#F05138' },
  rb: { icon: FileCode, color: '#701516' },
  php: { icon: FileCode, color: '#4F5D95' },
  cs: { icon: FileCode, color: '#178600' },
  xml: { icon: FileCode, color: '#0060ac' },
  vue: { icon: FileCode, color: '#41b883' },
  svelte: { icon: FileCode, color: '#ff3e00' }
}

export function getFileTypeIcon(filename: string, size = 14): React.ReactElement {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const mapping = extensionMap[ext]

  if (mapping) {
    const Icon = mapping.icon
    return <Icon size={size} className="shrink-0" style={{ color: mapping.color }} />
  }

  return <File size={size} className="shrink-0 text-secondary" />
}

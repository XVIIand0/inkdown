import { observable, runInAction, ObservableMap } from 'mobx'
import type { Store } from './store'

interface OpenFileEntry {
  content: string
  originalContent: string
  language: string
  dirty: boolean
}

const extensionToLanguage: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  json: 'json',
  md: 'markdown',
  css: 'css',
  html: 'html',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  xml: 'xml',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin'
}

export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return extensionToLanguage[ext] || 'plaintext'
}

export class CodeFileStore {
  private store: Store
  readonly openFiles: ObservableMap<string, OpenFileEntry> = observable.map()

  constructor(store: Store) {
    this.store = store
  }

  async loadFile(filePath: string) {
    const existing = this.openFiles.get(filePath)
    if (existing) {
      // Re-read from disk if not dirty (pick up external changes)
      if (!existing.dirty) {
        try {
          const content = await window.api.fs.readFile(filePath, 'utf-8')
          runInAction(() => {
            existing.content = content as string
            existing.originalContent = content as string
          })
        } catch {
          // File may have been deleted — keep stale content
        }
      }
      return
    }
    try {
      const content = await window.api.fs.readFile(filePath, 'utf-8')
      const language = detectLanguage(filePath)
      runInAction(() => {
        this.openFiles.set(filePath, {
          content: content as string,
          originalContent: content as string,
          language,
          dirty: false
        })
      })
    } catch (e) {
      console.error('Failed to load file:', filePath, e)
    }
  }

  updateContent(filePath: string, content: string) {
    const entry = this.openFiles.get(filePath)
    if (!entry) return
    runInAction(() => {
      entry.content = content
      entry.dirty = content !== entry.originalContent
    })
  }

  async saveFile(filePath: string) {
    const entry = this.openFiles.get(filePath)
    if (!entry) return
    try {
      await window.api.fs.writeFile(filePath, entry.content)
      runInAction(() => {
        entry.originalContent = entry.content
        entry.dirty = false
      })
    } catch (e) {
      console.error('Failed to save file:', filePath, e)
    }
  }

  closeFile(filePath: string) {
    runInAction(() => {
      this.openFiles.delete(filePath)
    })
  }

  getFileContent(filePath: string): OpenFileEntry | null {
    return this.openFiles.get(filePath) || null
  }

  isFileDirty(filePath: string): boolean {
    return this.openFiles.get(filePath)?.dirty ?? false
  }
}

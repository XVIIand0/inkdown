import { ipcMain } from 'electron'
import { readdirSync, readFileSync, statSync, existsSync, createReadStream } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createInterface } from 'readline'
import {
  parseJsonlLine,
  extractUserText,
  extractFirstUserMessage,
  extractLastTimestamp,
  parseSessionMessages
} from './claude-code-parser'

const claudeDir = join(homedir(), '.claude')
const projectsDir = join(claudeDir, 'projects')

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.cache',
  '.vite',
  'coverage',
  '__pycache__'
])

function decodeProjectDirName(dirName: string): string {
  const sepIndex = dirName.indexOf('--')
  if (sepIndex === -1) return dirName.replace(/-/g, '/')
  const drive = dirName.substring(0, sepIndex)
  const rest = dirName.substring(sepIndex + 2)
  return drive + ':\\' + rest.replace(/-/g, '\\')
}

ipcMain.handle('claude-code:getProjects', async () => {
  if (!existsSync(projectsDir)) return []
  try {
    const entries = readdirSync(projectsDir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const dirPath = join(projectsDir, e.name)
        let sessionCount = 0
        try {
          sessionCount = readdirSync(dirPath).filter(
            (f) => f.endsWith('.jsonl') && !statSync(join(dirPath, f)).isDirectory()
          ).length
        } catch {}
        const hasMemory = existsSync(join(dirPath, 'memory'))
        return {
          id: e.name,
          name: e.name,
          path: decodeProjectDirName(e.name),
          sessionCount,
          hasMemory
        }
      })
  } catch {
    return []
  }
})

ipcMain.handle('claude-code:getSessions', async (_, projectId: string) => {
  const dirPath = join(projectsDir, projectId)
  if (!existsSync(dirPath)) return []
  try {
    const files = readdirSync(dirPath).filter((f) => {
      if (!f.endsWith('.jsonl')) return false
      try {
        return !statSync(join(dirPath, f)).isDirectory()
      } catch {
        return false
      }
    })
    return files.map((f) => {
      const filePath = join(dirPath, f)
      const id = f.replace('.jsonl', '')
      let firstMessage = ''
      let messageCount = 0
      let lastTimestamp = ''

      try {
        const content = readFileSync(filePath, 'utf-8')
        const lines = content.split('\n').filter((l) => l.trim())
        messageCount = lines.length
        firstMessage = extractFirstUserMessage(lines)
        lastTimestamp = extractLastTimestamp(lines[lines.length - 1])
      } catch {}

      return { id, firstMessage, lastTimestamp, messageCount }
    })
  } catch {
    return []
  }
})

ipcMain.handle(
  'claude-code:getSessionMessages',
  async (
    _,
    projectId: string,
    sessionId: string,
    offset: number = 0,
    limit: number = 100
  ) => {
    const filePath = join(projectsDir, projectId, `${sessionId}.jsonl`)
    if (!existsSync(filePath)) return []
    try {
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n').filter((l) => l.trim())
      return parseSessionMessages(lines, offset, limit)
    } catch {
      return []
    }
  }
)

ipcMain.handle('claude-code:getProjectFiles', async (_, projectPath: string) => {
  if (!existsSync(projectPath)) return []

  function readDir(
    dirPath: string,
    depth: number
  ): Array<{ name: string; path: string; isDirectory: boolean; children?: any[] }> {
    if (depth > 2) return []
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      return entries
        .filter((e) => !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        .map((e) => {
          const fullPath = join(dirPath, e.name)
          const isDir = e.isDirectory()
          const result: {
            name: string
            path: string
            isDirectory: boolean
            children?: any[]
          } = {
            name: e.name,
            path: fullPath,
            isDirectory: isDir
          }
          if (isDir && depth < 2) {
            result.children = readDir(fullPath, depth + 1)
          }
          return result
        })
    } catch {
      return []
    }
  }

  return readDir(projectPath, 0)
})

function extractTextContent(parsed: Record<string, any>): string {
  if (parsed.type === 'user') {
    return extractUserText(parsed)
  }
  if (parsed.type === 'assistant') {
    const content = parsed.message?.content
    if (Array.isArray(content)) {
      const textBlock = content.find((b: Record<string, any>) => b.type === 'text')
      return textBlock?.text || ''
    }
    return typeof content === 'string' ? content : ''
  }
  return ''
}

function truncateAroundMatch(text: string, query: string, maxLen: number = 200): string {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQuery)
  if (idx === -1) return text.substring(0, maxLen)
  const start = Math.max(0, idx - 80)
  const end = Math.min(text.length, idx + query.length + 80)
  let snippet = text.substring(start, end)
  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet = snippet + '...'
  return snippet.substring(0, maxLen + 6)
}

ipcMain.handle('claude-code:searchAllSessions', async (_, query: string) => {
  if (!query || !existsSync(projectsDir)) return []

  const MAX_MATCHES = 100
  let totalMatches = 0
  const results: Array<{
    projectId: string
    projectPath: string
    sessionId: string
    matches: Array<{ type: string; content: string; timestamp: number }>
  }> = []

  let projectDirs: string[]
  try {
    projectDirs = readdirSync(projectsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return []
  }

  const lowerQuery = query.toLowerCase()

  for (const projectDirName of projectDirs) {
    if (totalMatches >= MAX_MATCHES) break
    const projectDir = join(projectsDir, projectDirName)
    const projectPath = decodeProjectDirName(projectDirName)

    let sessionFiles: string[]
    try {
      sessionFiles = readdirSync(projectDir).filter((f) => {
        if (!f.endsWith('.jsonl')) return false
        try {
          return !statSync(join(projectDir, f)).isDirectory()
        } catch {
          return false
        }
      })
    } catch {
      continue
    }

    for (const sessionFile of sessionFiles) {
      if (totalMatches >= MAX_MATCHES) break
      const sessionId = sessionFile.replace('.jsonl', '')
      const filePath = join(projectDir, sessionFile)
      const sessionMatches: Array<{ type: string; content: string; timestamp: number }> = []

      try {
        const rl = createInterface({
          input: createReadStream(filePath, { encoding: 'utf-8' }),
          crlfDelay: Infinity
        })

        for await (const line of rl) {
          if (totalMatches >= MAX_MATCHES) {
            rl.close()
            break
          }
          if (!line.trim()) continue
          const parsed = parseJsonlLine(line)
          if (!parsed) continue
          if (parsed.type !== 'user' && parsed.type !== 'assistant') continue

          const text = extractTextContent(parsed)
          if (!text) continue
          if (!text.toLowerCase().includes(lowerQuery)) continue

          sessionMatches.push({
            type: parsed.type,
            content: truncateAroundMatch(text, query),
            timestamp: parsed.timestamp
              ? new Date(parsed.timestamp).getTime()
              : 0
          })
          totalMatches++
        }
      } catch {
        continue
      }

      if (sessionMatches.length > 0) {
        results.push({
          projectId: projectDirName,
          projectPath,
          sessionId,
          matches: sessionMatches
        })
      }
    }
  }

  return results
})

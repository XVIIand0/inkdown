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
import { knex } from './database/model'

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

// Cache of user-confirmed path resolutions: dirName → confirmed path
const resolvedPathCache = new Map<string, string>()

/**
 * Returns all possible filesystem path candidates for a Claude project dir name.
 * Hyphens in the encoded name are ambiguous — could be path separators or literal hyphens.
 */
function decodeProjectDirNameCandidates(dirName: string): string[] {
  const cached = resolvedPathCache.get(dirName)
  if (cached) return [cached]

  // Windows: "C--Users-..." → "C:\Users\..."
  const sepIndex = dirName.indexOf('--')
  if (sepIndex !== -1) {
    const drive = dirName.substring(0, sepIndex)
    const rest = dirName.substring(sepIndex + 2)
    return [drive + ':\\' + rest.replace(/-/g, '\\')]
  }

  // Unix: resolve against the real filesystem
  const parts = dirName.split('-').filter(Boolean)
  const candidates = resolveAllUnixPaths(parts)
  if (candidates.length > 0) return candidates
  // Fallback: simple replace (path no longer exists on disk)
  return ['/' + parts.join('/')]
}

function decodeProjectDirName(dirName: string): string {
  return decodeProjectDirNameCandidates(dirName)[0]
}

/**
 * Find ALL valid filesystem paths that could match the encoded dir name.
 * Returns multiple candidates when the encoding is ambiguous.
 */
function resolveAllUnixPaths(parts: string[]): string[] {
  if (parts.length === 0) return ['/']

  function resolve(index: number, currentPath: string): string[] {
    if (index >= parts.length) return [currentPath]

    const results: string[] = []
    for (let end = parts.length; end > index; end--) {
      const segment = parts.slice(index, end).join('-')
      const candidate = currentPath + '/' + segment
      if (existsSync(candidate)) {
        if (end === parts.length) {
          results.push(candidate)
        } else {
          results.push(...resolve(end, candidate))
        }
      }
    }
    return results
  }

  return resolve(0, '')
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
        const candidatePaths = decodeProjectDirNameCandidates(e.name)
        return {
          id: e.name,
          name: e.name,
          path: candidatePaths[0],
          candidatePaths: candidatePaths.length > 1 ? candidatePaths : undefined,
          sessionCount,
          hasMemory
        }
      })
  } catch {
    return []
  }
})

// User confirms which path is correct for an ambiguous project dir name
ipcMain.handle(
  'claude-code:resolveProjectPath',
  async (_, projectDirName: string, confirmedPath: string) => {
    resolvedPathCache.set(projectDirName, confirmedPath)
    return true
  }
)

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

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.webm',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.lock', '.sqlite', '.db', '.wasm', '.node',
  '.DS_Store'
])

ipcMain.handle('claude-code:getProjectFilesFlat', async (_, projectPath: string) => {
  if (!existsSync(projectPath)) return []

  const results: Array<{ rel: string; abs: string }> = []
  const MAX_FILES = 10000
  const MAX_DEPTH = 10

  function walk(dirPath: string, depth: number) {
    if (depth > MAX_DEPTH || results.length >= MAX_FILES) return
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        if (results.length >= MAX_FILES) break
        if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue
        const fullPath = join(dirPath, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1)
        } else {
          const ext = entry.name.includes('.') ? '.' + entry.name.split('.').pop()!.toLowerCase() : ''
          if (BINARY_EXTENSIONS.has(ext)) continue
          const rel = fullPath.substring(projectPath.length + 1).replace(/\\/g, '/')
          results.push({ rel, abs: fullPath })
        }
      }
    } catch {
      // Permission denied or similar
    }
  }

  walk(projectPath, 0)
  return results
})

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

// ─── Session Alias (custom names) ───

function buildAliasId(
  hostId: string | null,
  projectId: string,
  sessionId: string
): string {
  return `${hostId || 'local'}|${projectId}|${sessionId}`
}

ipcMain.handle(
  'claude-code:getSessionAliases',
  async (_, projectId: string, hostId?: string | null) => {
    const prefix = `${hostId || 'local'}|${projectId}|`
    const rows = await knex('session_alias')
      .where('id', 'like', `${prefix}%`)
      .select('id', 'alias')
    const map: Record<string, string> = {}
    for (const row of rows) {
      const sessionId = row.id.substring(prefix.length)
      map[sessionId] = row.alias
    }
    return map
  }
)

ipcMain.handle(
  'claude-code:setSessionAlias',
  async (
    _,
    options: {
      projectId: string
      sessionId: string
      alias: string
      hostId?: string | null
    }
  ) => {
    const id = buildAliasId(options.hostId || null, options.projectId, options.sessionId)
    if (!options.alias.trim()) {
      await knex('session_alias').where('id', id).delete()
      return true
    }
    const existing = await knex('session_alias').where('id', id).first()
    if (existing) {
      await knex('session_alias')
        .where('id', id)
        .update({ alias: options.alias.trim(), updated: Date.now() })
    } else {
      await knex('session_alias').insert({
        id,
        alias: options.alias.trim(),
        updated: Date.now()
      })
    }
    return true
  }
)

// ─── Session Pin ───

ipcMain.handle(
  'claude-code:getSessionPins',
  async (_, projectId: string, hostId?: string | null) => {
    const prefix = `${hostId || 'local'}|${projectId}|`
    const rows = await knex('session_pin')
      .where('id', 'like', `${prefix}%`)
      .select('id')
    return rows.map((r) => r.id.substring(prefix.length))
  }
)

ipcMain.handle(
  'claude-code:toggleSessionPin',
  async (
    _,
    options: {
      projectId: string
      sessionId: string
      hostId?: string | null
    }
  ) => {
    const id = buildAliasId(options.hostId || null, options.projectId, options.sessionId)
    const existing = await knex('session_pin').where('id', id).first()
    if (existing) {
      await knex('session_pin').where('id', id).delete()
      return false
    } else {
      await knex('session_pin').insert({ id, created: Date.now() })
      return true
    }
  }
)

// ─── Project Config (icon, color, sort) ───

function buildProjectConfigId(hostId: string | null, projectId: string): string {
  return `${hostId || 'local'}|${projectId}`
}

ipcMain.handle(
  'claude-code:getProjectConfigs',
  async () => {
    const rows = await knex('project_config')
      .select('id', 'iconType', 'iconValue', 'sort', 'displayName')
    const map: Record<string, { iconType: string; iconValue?: string; sort: number; displayName?: string }> = {}
    for (const row of rows) {
      // Extract projectId from composite key (hostId|projectId)
      const pipeIdx = row.id.indexOf('|')
      const projectId = pipeIdx >= 0 ? row.id.substring(pipeIdx + 1) : row.id
      map[projectId] = {
        iconType: row.iconType || 'default',
        iconValue: row.iconValue || undefined,
        sort: row.sort ?? 0,
        displayName: row.displayName || undefined
      }
    }
    return map
  }
)

ipcMain.handle(
  'claude-code:setProjectConfig',
  async (
    _,
    options: {
      projectId: string
      hostId?: string | null
      iconType?: string
      iconValue?: string
      sort?: number
      displayName?: string
    }
  ) => {
    const id = buildProjectConfigId(options.hostId || null, options.projectId)
    const existing = await knex('project_config').where('id', id).first()
    const updates: Record<string, any> = { updated: Date.now() }
    if (options.iconType !== undefined) updates.iconType = options.iconType
    if (options.iconValue !== undefined) updates.iconValue = options.iconValue
    if (options.sort !== undefined) updates.sort = options.sort
    if (options.displayName !== undefined) updates.displayName = options.displayName || null
    if (existing) {
      await knex('project_config').where('id', id).update(updates)
    } else {
      await knex('project_config').insert({
        id,
        iconType: options.iconType || 'default',
        iconValue: options.iconValue || null,
        sort: options.sort ?? 0,
        displayName: options.displayName || null,
        updated: Date.now()
      })
    }
    return true
  }
)

ipcMain.handle(
  'claude-code:reorderProjects',
  async (
    _,
    options: {
      hostId?: string | null
      projectIds: string[]
    }
  ) => {
    const hostId = options.hostId || null
    for (let i = 0; i < options.projectIds.length; i++) {
      const id = buildProjectConfigId(hostId, options.projectIds[i])
      const existing = await knex('project_config').where('id', id).first()
      if (existing) {
        await knex('project_config').where('id', id).update({ sort: i, updated: Date.now() })
      } else {
        await knex('project_config').insert({
          id,
          iconType: 'default',
          iconValue: null,
          sort: i,
          updated: Date.now()
        })
      }
    }
    return true
  }
)

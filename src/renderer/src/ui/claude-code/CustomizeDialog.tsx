import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useStore } from '@/store/store'
import { useState, useEffect, useCallback } from 'react'
import { Modal } from 'antd'
import { IconPicker, IconType } from './IconPicker'
import { Loader2, Plus, X, Terminal, FileSearch, FileEdit, FilePlus, FolderSearch,
  Search, Globe, Bot, BookOpen, ChevronDown, ChevronRight, Plug, RefreshCw } from 'lucide-react'

const ipcRenderer = window.electron.ipcRenderer

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

// ─── Tool definitions ───

type ToolMode = 'default' | 'allow' | 'deny'

interface ToolDef {
  name: string
  icon: React.ReactNode
  description: string
  patternHint?: string
}

const TOOLS: ToolDef[] = [
  { name: 'Bash', icon: <Terminal size={13} />, description: 'Shell commands', patternHint: 'npm run *, git *' },
  { name: 'Read', icon: <FileSearch size={13} />, description: 'Read files', patternHint: './.env, /src/**/*.ts' },
  { name: 'Edit', icon: <FileEdit size={13} />, description: 'Edit files', patternHint: '/src/**/*.ts' },
  { name: 'Write', icon: <FilePlus size={13} />, description: 'Create files', patternHint: '/src/**/*.ts' },
  { name: 'Glob', icon: <FolderSearch size={13} />, description: 'Find files by pattern' },
  { name: 'Grep', icon: <Search size={13} />, description: 'Search file contents' },
  { name: 'WebSearch', icon: <Globe size={13} />, description: 'Web search' },
  { name: 'WebFetch', icon: <Globe size={13} />, description: 'Fetch URLs', patternHint: 'domain:example.com' },
  { name: 'Agent', icon: <Bot size={13} />, description: 'Spawn sub-agents' },
  { name: 'NotebookEdit', icon: <BookOpen size={13} />, description: 'Edit notebooks' }
]

interface ToolState {
  mode: ToolMode
  patterns: string[]
}

// MCP server state: groups mcp__server__tool rules
interface McpServerState {
  mode: ToolMode
  tools: string[]  // individual tool names (e.g. "click", "navigate_page"), or empty = all
}

function parseRule(rule: string): { tool: string; pattern: string | null } {
  const m = rule.match(/^([\w-]+)\((.+)\)$/)
  if (m) return { tool: m[1], pattern: m[2] }
  return { tool: rule, pattern: null }
}

// Parse MCP rule: "mcp__chrome-devtools__click" → { server: "chrome-devtools", tool: "click" }
// Also handles wildcards: "mcp__chrome-devtools__*" → { server: "chrome-devtools", tool: "*" }
function parseMcpRule(rule: string): { server: string; tool: string } | null {
  const m = rule.match(/^mcp__([^_]+(?:-[^_]+)*)__(.+)$/)
  if (m) return { server: m[1], tool: m[2] }
  return null
}

function buildRules(toolStates: Record<string, ToolState>, type: 'allow' | 'deny'): string[] {
  const rules: string[] = []
  for (const [name, state] of Object.entries(toolStates)) {
    if (state.mode !== type) continue
    if (state.patterns.length === 0) {
      rules.push(name)
    } else {
      for (const p of state.patterns) {
        rules.push(`${name}(${p})`)
      }
    }
  }
  return rules
}

function buildMcpRules(mcpStates: Record<string, McpServerState>, type: 'allow' | 'deny'): string[] {
  const rules: string[] = []
  for (const [server, state] of Object.entries(mcpStates)) {
    if (state.mode !== type) continue
    if (state.tools.length === 0) {
      rules.push(`mcp__${server}__*`)
    } else {
      for (const tool of state.tools) {
        rules.push(`mcp__${server}__${tool}`)
      }
    }
  }
  return rules
}

interface ParsedStates {
  states: Record<string, ToolState>
  mcpStates: Record<string, McpServerState>
  extraAllow: string[]
  extraDeny: string[]
}

function parseRulesToStates(allow: string[], deny: string[]): ParsedStates {
  const states: Record<string, ToolState> = {}
  const mcpStates: Record<string, McpServerState> = {}
  const knownTools = new Set(TOOLS.map((t) => t.name))
  const extraAllow: string[] = []
  const extraDeny: string[] = []

  for (const t of TOOLS) {
    states[t.name] = { mode: 'default', patterns: [] }
  }

  function processRule(rule: string, type: 'allow' | 'deny') {
    // Check MCP rule first
    const mcp = parseMcpRule(rule)
    if (mcp) {
      if (!mcpStates[mcp.server]) {
        mcpStates[mcp.server] = { mode: 'default', tools: [] }
      }
      mcpStates[mcp.server].mode = type
      if (mcp.tool !== '*') {
        mcpStates[mcp.server].tools.push(mcp.tool)
      }
      return
    }

    const { tool, pattern } = parseRule(rule)
    if (!knownTools.has(tool)) {
      if (type === 'allow') extraAllow.push(rule)
      else extraDeny.push(rule)
      return
    }
    states[tool].mode = type
    if (pattern) states[tool].patterns.push(pattern)
  }

  for (const rule of allow) processRule(rule, 'allow')
  for (const rule of deny) processRule(rule, 'deny')
  return { states, mcpStates, extraAllow, extraDeny }
}

// ─── Per-Tool Row ───

// Sort patterns: alphabetical, but broader patterns (fewer segments) come first
// so "git *" appears before "git add *", "git commit *", etc.
function sortPatterns(patterns: string[]): string[] {
  return [...patterns].sort((a, b) => {
    const aParts = a.split(/\s+/)
    const bParts = b.split(/\s+/)
    // Compare segment by segment
    const len = Math.min(aParts.length, bParts.length)
    for (let i = 0; i < len; i++) {
      if (aParts[i] !== bParts[i]) return aParts[i].localeCompare(bParts[i])
    }
    // Shorter (broader) patterns first
    return aParts.length - bParts.length
  })
}

// Check if patternA is a broader wildcard that covers patternB
// e.g. "git *" covers "git add *"
function isCoveredBy(pattern: string, broader: string): boolean {
  if (pattern === broader) return false
  // "git *" covers "git add *" — broader ends with * and its prefix matches
  if (!broader.endsWith('*')) return false
  const prefix = broader.slice(0, -1) // "git " from "git *"
  return pattern.startsWith(prefix) && pattern.length > prefix.length
}

function ToolRow({
  def,
  state,
  onChange
}: {
  def: ToolDef
  state: ToolState
  onChange: (s: ToolState) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [newPattern, setNewPattern] = useState('')
  const hasPatterns = state.patterns.length > 0
  const showExpand = state.mode !== 'default' && def.patternHint

  const sorted = sortPatterns(state.patterns)

  const modeColors: Record<ToolMode, string> = {
    default: '',
    allow: 'text-green-500',
    deny: 'text-red-400'
  }

  const updatePattern = (oldIdx: number, newValue: string) => {
    // oldIdx is index in original state.patterns
    const next = [...state.patterns]
    const trimmed = newValue.trim()
    if (trimmed) {
      next[oldIdx] = trimmed
    } else {
      next.splice(oldIdx, 1)
    }
    onChange({ ...state, patterns: next })
  }

  return (
    <div className="border-b border-theme last:border-b-0">
      <div className="flex items-center gap-2 py-1.5 px-1">
        {/* Expand toggle */}
        <button
          className={'w-4 h-4 flex items-center justify-center shrink-0 ' +
            (showExpand ? 'text-secondary cursor-pointer' : 'opacity-0 pointer-events-none')}
          onClick={() => showExpand && setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Icon + name */}
        <span className="text-secondary shrink-0">{def.icon}</span>
        <span className="text-xs md-text w-24 shrink-0 font-medium">{def.name}</span>
        <span className="text-xs text-secondary truncate flex-1">{def.description}</span>

        {/* Mode selector */}
        <div className="flex items-center gap-0.5 shrink-0">
          {(['default', 'allow', 'deny'] as ToolMode[]).map((m) => (
            <button
              key={m}
              className={
                'px-2 py-0.5 text-xs rounded transition-colors ' +
                (state.mode === m
                  ? (m === 'allow'
                    ? 'bg-green-500/15 text-green-500'
                    : m === 'deny'
                      ? 'bg-red-500/15 text-red-400'
                      : 'active-bg md-text')
                  : 'text-secondary hover-bg')
              }
              onClick={() => {
                const next: ToolState = { mode: m, patterns: m === 'default' ? [] : state.patterns }
                onChange(next)
                if (m !== 'default' && def.patternHint && state.patterns.length === 0) {
                  setExpanded(true)
                }
              }}
            >
              {m === 'default' ? '—' : m === 'allow' ? 'Allow' : 'Deny'}
            </button>
          ))}
        </div>

        {/* Pattern count badge */}
        {hasPatterns && (
          <span
            className={'text-xs px-1.5 rounded-full shrink-0 ' + modeColors[state.mode]}
            style={{ background: 'var(--md-bg-mute)', fontSize: 10 }}
          >
            {state.patterns.length} rule{state.patterns.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Expanded patterns */}
      {expanded && state.mode !== 'default' && (
        <div className="pl-8 pr-2 pb-2 space-y-1">
          {!hasPatterns && (
            <div className="text-xs text-secondary italic">
              All {def.name} usage — add patterns to restrict
            </div>
          )}
          {sorted.map((p) => {
            const origIdx = state.patterns.indexOf(p)
            // Check if covered by a broader pattern in the list
            const coveredBy = sorted.find((other) => isCoveredBy(p, other))
            // Indent level: count how many broader patterns exist as prefix
            const depth = sorted.filter((other) => isCoveredBy(p, other)).length

            return (
              <div
                key={origIdx}
                className="flex items-center gap-1.5 text-xs group"
                style={{ paddingLeft: depth * 12 }}
              >
                {depth > 0 && (
                  <span className="text-secondary opacity-40 shrink-0 select-none">└</span>
                )}
                <input
                  className={
                    'flex-1 px-2 py-0.5 rounded md-text font-mono text-xs border border-transparent ' +
                    'focus:border-theme focus:primary-bg-color outline-none ' +
                    (coveredBy ? 'opacity-60 ' : '')
                  }
                  style={{ background: 'var(--md-bg-mute)' }}
                  defaultValue={p}
                  spellCheck={false}
                  onBlur={(e) => {
                    if (e.target.value !== p) updatePattern(origIdx, e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur()
                    } else if (e.key === 'Backspace' && e.currentTarget.value === '') {
                      updatePattern(origIdx, '')
                    }
                  }}
                />
                {coveredBy && (
                  <span
                    className="text-xs text-secondary shrink-0 select-none"
                    title={`Already covered by "${coveredBy}"`}
                    style={{ fontSize: 9 }}
                  >
                    ⊂ {coveredBy}
                  </span>
                )}
                <button
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover-bg text-secondary shrink-0"
                  onClick={() => updatePattern(origIdx, '')}
                >
                  <X size={11} />
                </button>
              </div>
            )
          })}
          <div className="flex items-center gap-1.5">
            <input
              className="flex-1 text-xs py-0.5 px-2 rounded border border-theme primary-bg-color md-text font-mono"
              placeholder={def.patternHint || 'pattern'}
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newPattern.trim()) {
                  onChange({ ...state, patterns: [...state.patterns, newPattern.trim()] })
                  setNewPattern('')
                }
              }}
            />
            <button
              className="p-0.5 rounded hover-bg text-secondary shrink-0"
              onClick={() => {
                if (newPattern.trim()) {
                  onChange({ ...state, patterns: [...state.patterns, newPattern.trim()] })
                  setNewPattern('')
                }
              }}
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Permissions Tab Content ───

// ─── MCP Server Row ───

function McpServerRow({
  server,
  state,
  onChange,
  projectPath,
  serverType,
  needsAuth
}: {
  server: string
  state: McpServerState
  onChange: (s: McpServerState) => void
  projectPath?: string
  serverType: string
  needsAuth: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [availableTools, setAvailableTools] = useState<string[] | null>(null)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const hasTools = state.tools.length > 0
  const enabledSet = new Set(state.tools)
  const canDiscover = serverType === 'stdio'

  const discover = useCallback(async () => {
    if (!canDiscover) return
    setDiscovering(true)
    setDiscoverError(null)
    try {
      const result = await ipcRenderer.invoke('claude-code:discoverMcpTools', {
        projectPath,
        serverName: server
      })
      if (result.success && result.tools) {
        setAvailableTools(result.tools.sort())
      } else {
        setDiscoverError(result.error || 'Failed')
      }
    } catch (e: any) {
      setDiscoverError(e.message)
    } finally {
      setDiscovering(false)
    }
  }, [server, projectPath, canDiscover])

  // Auto-discover on expand (only for stdio)
  useEffect(() => {
    if (expanded && state.mode !== 'default' && canDiscover && !availableTools && !discovering) {
      discover()
    }
  }, [expanded, state.mode, canDiscover, availableTools, discovering, discover])

  const toggleTool = useCallback((tool: string) => {
    if (enabledSet.has(tool)) {
      onChange({ ...state, tools: state.tools.filter((t) => t !== tool) })
    } else {
      onChange({ ...state, tools: [...state.tools, tool] })
    }
  }, [state, onChange, enabledSet])

  const selectAll = useCallback(() => {
    if (availableTools) {
      onChange({ ...state, tools: [...availableTools] })
    }
  }, [availableTools, state, onChange])

  const selectNone = useCallback(() => {
    onChange({ ...state, tools: [] })
  }, [state, onChange])

  return (
    <div className="border-b border-theme last:border-b-0">
      <div className="flex items-center gap-2 py-1.5 px-1">
        <button
          className="w-4 h-4 flex items-center justify-center shrink-0 text-secondary cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="text-secondary shrink-0"><Plug size={13} /></span>
        <span className="text-xs md-text shrink-0 font-medium truncate max-w-[140px]">{server}</span>
        <span
          className="text-xs px-1 rounded shrink-0"
          style={{ background: 'var(--md-bg-mute)', fontSize: 10 }}
        >
          {serverType === 'sse' ? 'SSE' : 'stdio'}
        </span>
        {needsAuth && (
          <span
            className="text-xs px-1.5 rounded shrink-0 text-amber-500"
            style={{ background: 'rgba(245,158,11,0.1)', fontSize: 10 }}
            title="Use this MCP tool in a Claude Code session to trigger OAuth authentication"
          >
            Needs auth
          </span>
        )}
        <span className="text-xs text-secondary truncate flex-1"></span>

        <div className="flex items-center gap-0.5 shrink-0">
          {(['default', 'allow', 'deny'] as ToolMode[]).map((m) => (
            <button
              key={m}
              className={
                'px-2 py-0.5 text-xs rounded transition-colors ' +
                (state.mode === m
                  ? (m === 'allow'
                    ? 'bg-green-500/15 text-green-500'
                    : m === 'deny'
                      ? 'bg-red-500/15 text-red-400'
                      : 'active-bg md-text')
                  : 'text-secondary hover-bg')
              }
              onClick={() => {
                onChange({ mode: m, tools: m === 'default' ? [] : state.tools })
                if (m !== 'default') setExpanded(true)
              }}
            >
              {m === 'default' ? '—' : m === 'allow' ? 'Allow' : 'Deny'}
            </button>
          ))}
        </div>

        {hasTools && (
          <span
            className="text-xs px-1.5 rounded-full shrink-0"
            style={{ background: 'var(--md-bg-mute)', fontSize: 10 }}
          >
            {state.tools.length}
          </span>
        )}
      </div>

      {expanded && state.mode !== 'default' && (
        <div className="pl-8 pr-2 pb-2">
          {/* Header with select all/none */}
          <div className="flex items-center gap-2 mb-1.5">
            {!hasTools && !availableTools && !discovering && (
              <span className="text-xs text-secondary italic flex-1">
                {canDiscover
                  ? 'All tools — loading tool list...'
                  : 'All tools on this server'}
              </span>
            )}
            {availableTools && (
              <>
                <span className="text-xs text-secondary flex-1">
                  {availableTools.length} tools
                </span>
                <button className="text-xs text-secondary hover:text-inherit" onClick={selectAll}>
                  All
                </button>
                <button className="text-xs text-secondary hover:text-inherit" onClick={selectNone}>
                  None
                </button>
              </>
            )}
            {canDiscover && (
              <button
                className="text-xs text-secondary hover:text-inherit flex items-center gap-1"
                onClick={discover}
                disabled={discovering}
              >
                {discovering ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                {discovering ? 'Loading...' : 'Refresh'}
              </button>
            )}
          </div>

          {!canDiscover && !hasTools && (
            <div className="text-xs text-secondary mb-1.5">
              SSE server — {needsAuth
                ? 'use this tool in a Claude session to trigger OAuth, then add tools manually'
                : 'type tool names manually, or leave empty for all tools'}
            </div>
          )}

          {discoverError && (
            <div className="text-xs text-red-400 mb-1.5">{discoverError}</div>
          )}

          {discovering && !availableTools && (
            <div className="flex items-center gap-1.5 text-xs text-secondary py-2">
              <Loader2 size={12} className="animate-spin" />
              Querying server for tools...
            </div>
          )}

          {/* Checkbox grid of available tools */}
          {availableTools && availableTools.length > 0 && (
            <div className="grid gap-0.5" style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))'
            }}>
              {availableTools.map((tool) => (
                <label
                  key={tool}
                  className="flex items-center gap-1.5 py-0.5 px-1.5 rounded text-xs cursor-pointer hover-bg"
                >
                  <input
                    type="checkbox"
                    checked={enabledSet.has(tool)}
                    onChange={() => toggleTool(tool)}
                    className="rounded"
                  />
                  <span className="md-text font-mono truncate" title={tool}>{tool}</span>
                </label>
              ))}
            </div>
          )}

          {/* Manual add */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <input
              className="flex-1 text-xs py-0.5 px-2 rounded border border-theme primary-bg-color md-text font-mono"
              placeholder="Add tool manually..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = e.currentTarget.value.trim()
                  if (v && !enabledSet.has(v)) {
                    onChange({ ...state, tools: [...state.tools, v] })
                    if (availableTools && !availableTools.includes(v)) {
                      setAvailableTools([...availableTools, v].sort())
                    }
                    e.currentTarget.value = ''
                  }
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Permissions Tab Content ───

function PermissionsTab({ projectPath }: { projectPath: string }) {
  const [loading, setLoading] = useState(true)
  const [toolStates, setToolStates] = useState<Record<string, ToolState>>({})
  const [mcpStates, setMcpStates] = useState<Record<string, McpServerState>>({})
  const [mcpTypes, setMcpTypes] = useState<Record<string, string>>({})
  const [mcpAuth, setMcpAuth] = useState<Record<string, boolean>>({})
  const [extraAllow, setExtraAllow] = useState<string[]>([])
  const [extraDeny, setExtraDeny] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newMcpServer, setNewMcpServer] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      ipcRenderer.invoke('claude-code:readProjectClaudeSettings', projectPath),
      ipcRenderer.invoke('claude-code:getMcpServers', projectPath)
    ])
      .then(([settings, mcpServerList]: [any, Array<{ name: string; type: string; needsAuth?: boolean }>]) => {
        const perms = settings?.permissions || {}
        const { states, mcpStates: ms, extraAllow: ea, extraDeny: ed } = parseRulesToStates(
          perms.allow || [],
          perms.deny || []
        )
        setToolStates(states)
        // Merge discovered MCP servers (from config) with those found in permission rules
        const merged = { ...ms }
        const types: Record<string, string> = {}
        const auth: Record<string, boolean> = {}
        for (const srv of (mcpServerList || [])) {
          types[srv.name] = srv.type
          if (srv.needsAuth) auth[srv.name] = true
          if (!merged[srv.name]) {
            merged[srv.name] = { mode: 'default', tools: [] }
          }
        }
        setMcpStates(merged)
        setMcpTypes(types)
        setMcpAuth(auth)
        setExtraAllow(ea)
        setExtraDeny(ed)
        setDirty(false)
      })
      .catch(() => {
        const states: Record<string, ToolState> = {}
        for (const t of TOOLS) states[t.name] = { mode: 'default', patterns: [] }
        setToolStates(states)
      })
      .finally(() => setLoading(false))
  }, [projectPath])

  const updateTool = useCallback((name: string, state: ToolState) => {
    setToolStates((prev) => ({ ...prev, [name]: state }))
    setDirty(true)
  }, [])

  const updateMcp = useCallback((server: string, state: McpServerState) => {
    setMcpStates((prev) => {
      if (state.mode === 'default' && state.tools.length === 0) {
        const next = { ...prev }
        delete next[server]
        return next
      }
      return { ...prev, [server]: state }
    })
    setDirty(true)
  }, [])

  const addMcpServer = useCallback(() => {
    const name = newMcpServer.trim()
    if (name && !mcpStates[name]) {
      setMcpStates((prev) => ({ ...prev, [name]: { mode: 'allow', tools: [] } }))
      setNewMcpServer('')
      setDirty(true)
    }
  }, [newMcpServer, mcpStates])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const allow = [
        ...buildRules(toolStates, 'allow'),
        ...buildMcpRules(mcpStates, 'allow'),
        ...extraAllow
      ]
      const deny = [
        ...buildRules(toolStates, 'deny'),
        ...buildMcpRules(mcpStates, 'deny'),
        ...extraDeny
      ]

      const existing = await ipcRenderer.invoke(
        'claude-code:readProjectClaudeSettings',
        projectPath
      ) || {}
      const perms = { ...(existing.permissions || {}) }
      if (allow.length > 0) { perms.allow = allow } else { delete perms.allow }
      if (deny.length > 0) { perms.deny = deny } else { delete perms.deny }
      const updated = { ...existing }
      if (Object.keys(perms).length > 0) {
        updated.permissions = perms
      } else {
        delete updated.permissions
      }
      await ipcRenderer.invoke('claude-code:writeProjectClaudeSettings', projectPath, updated)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }, [projectPath, toolStates, mcpStates, extraAllow, extraDeny])

  const setAllAllow = useCallback(() => {
    const next: Record<string, ToolState> = {}
    for (const t of TOOLS) next[t.name] = { mode: 'allow', patterns: [] }
    setToolStates(next)
    // Also set all MCP servers to allow
    const nextMcp: Record<string, McpServerState> = {}
    for (const [s, st] of Object.entries(mcpStates)) {
      nextMcp[s] = { ...st, mode: 'allow' }
    }
    setMcpStates(nextMcp)
    setDirty(true)
  }, [mcpStates])

  const resetAll = useCallback(() => {
    const next: Record<string, ToolState> = {}
    for (const t of TOOLS) next[t.name] = { mode: 'default', patterns: [] }
    setToolStates(next)
    setMcpStates({})
    setExtraAllow([])
    setExtraDeny([])
    setDirty(true)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-secondary">
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }

  const mcpServers = Object.keys(mcpStates).sort()

  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center justify-between">
        <div className="text-xs text-secondary">
          <code className="px-1 py-0.5 rounded" style={{ background: 'var(--md-bg-mute)' }}>
            .claude/settings.local.json
          </code>
        </div>
        <div className="flex gap-2">
          <button className="text-xs text-secondary hover:text-inherit" onClick={setAllAllow}>
            Allow all
          </button>
          <button className="text-xs text-secondary hover:text-inherit" onClick={resetAll}>
            Reset
          </button>
        </div>
      </div>

      {/* Built-in tools */}
      <div>
        <div className="text-xs text-secondary mb-1 font-medium">Built-in Tools</div>
        <div className="border border-theme rounded overflow-hidden">
          {TOOLS.map((def) => (
            <ToolRow
              key={def.name}
              def={def}
              state={toolStates[def.name] || { mode: 'default', patterns: [] }}
              onChange={(s) => updateTool(def.name, s)}
            />
          ))}
        </div>
      </div>

      {/* MCP Servers */}
      <div>
        <div className="text-xs text-secondary mb-1 font-medium">MCP Servers</div>
        {mcpServers.length > 0 && (
          <div className="border border-theme rounded overflow-hidden mb-1.5">
            {mcpServers.map((server) => (
              <McpServerRow
                key={server}
                server={server}
                state={mcpStates[server]}
                onChange={(s) => updateMcp(server, s)}
                projectPath={projectPath}
                serverType={mcpTypes[server] || 'stdio'}
                needsAuth={mcpAuth[server] || false}
              />
            ))}
          </div>
        )}
        {mcpServers.length === 0 && (
          <div className="text-xs text-secondary italic mb-1.5">No MCP servers configured</div>
        )}
        <div className="flex items-center gap-1.5">
          <input
            className="flex-1 text-xs py-0.5 px-2 rounded border border-theme primary-bg-color md-text"
            placeholder="Add MCP server name (e.g. chrome-devtools)"
            value={newMcpServer}
            onChange={(e) => setNewMcpServer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addMcpServer()
            }}
          />
          <button
            className="p-0.5 rounded hover-bg text-secondary shrink-0"
            onClick={addMcpServer}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Extra rules not mapped to known tools or MCP */}
      {(extraAllow.length > 0 || extraDeny.length > 0) && (
        <div className="text-xs text-secondary">
          <span className="font-medium">Other rules: </span>
          {[...extraAllow.map((r) => `+${r}`), ...extraDeny.map((r) => `-${r}`)].join(', ')}
        </div>
      )}

      {dirty && (
        <div className="flex justify-end pt-1">
          <button
            className="px-3 py-1.5 text-xs rounded text-white flex items-center gap-1.5"
            style={{ background: 'var(--accent)' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Dialog ───

export const CustomizeDialog = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const [show, setShow] = useState(false)
  const [target, setTarget] = useState<CustomizeTarget | null>(null)
  const [activeTab, setActiveTab] = useState<'appearance' | 'permissions'>('appearance')

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
      setActiveTab('appearance')
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

  const showPermissionsTab = target?.type === 'project' && target.path

  return (
    <Modal
      open={show}
      title={title}
      onOk={handleSave}
      onCancel={handleCancel}
      width={showPermissionsTab ? 620 : 420}
      destroyOnClose
    >
      {target && (
        <div>
          {/* Tabs — only show when project has a path */}
          {showPermissionsTab && (
            <div className="flex gap-0 border-b border-theme mb-3 -mt-1">
              <button
                className={
                  'px-3 py-1.5 text-xs border-b-2 transition-colors ' +
                  (activeTab === 'appearance'
                    ? 'border-current md-text'
                    : 'border-transparent text-secondary hover:text-inherit')
                }
                onClick={() => setActiveTab('appearance')}
              >
                Appearance
              </button>
              <button
                className={
                  'px-3 py-1.5 text-xs border-b-2 transition-colors ' +
                  (activeTab === 'permissions'
                    ? 'border-current md-text'
                    : 'border-transparent text-secondary hover:text-inherit')
                }
                onClick={() => setActiveTab('permissions')}
              >
                Permissions
              </button>
            </div>
          )}

          {/* Appearance tab */}
          {activeTab === 'appearance' && (
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

          {/* Permissions tab */}
          {activeTab === 'permissions' && target.path && (
            <PermissionsTab projectPath={target.path} />
          )}
        </div>
      )}
    </Modal>
  )
})

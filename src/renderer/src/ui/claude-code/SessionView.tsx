import { useCallback, useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import {
  User,
  Bot,
  Clock,
  Loader2,
  AlertCircle,
  Play,
  History,
  Square,
  RotateCw,
  Terminal as TerminalIcon
} from 'lucide-react'
import dayjs from 'dayjs'
import Markdown from '@/ui/markdown/Markdown'
import { useStore } from '@/store/store'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { ProjectBadge } from './ProjectBadge'
import '@xterm/xterm/css/xterm.css'

const ipcRenderer = window.electron.ipcRenderer

type ViewMode = 'live' | 'history'

// Read current app CSS variables and build an xterm theme
function getTerminalTheme(): Record<string, string> {
  const s = getComputedStyle(document.documentElement)
  const get = (v: string) => s.getPropertyValue(v).trim()

  const bg = get('--primary-bg-color') || '#1e1e2e'
  const fg = get('--md-text') || '#cdd6f4'
  const accent = get('--accent') || '#89b4fa'
  const muted = get('--text-secondary') || '#6c7086'
  const selection = get('--active-bg') || '#45475a'

  return {
    background: bg,
    foreground: fg,
    cursor: accent,
    cursorAccent: bg,
    selectionBackground: selection,
    selectionForeground: fg,
    black: muted,
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: accent,
    magenta: '#cba6f7',
    cyan: '#94e2d5',
    white: fg,
    brightBlack: muted,
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: accent,
    brightMagenta: '#cba6f7',
    brightCyan: '#94e2d5',
    brightWhite: fg
  }
}

const EmptyState = () => {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex items-center justify-center text-secondary">
      <div className="text-center space-y-3">
        <Bot size={48} className="mx-auto opacity-40" />
        <p className="text-lg">{t('claudeCode.selectSession')}</p>
      </div>
    </div>
  )
}

const MessageBubble = ({ message }: { message: any }) => {
  const { t } = useTranslation()
  const isUser = message.type === 'user' || message.role === 'user'
  const time = message.timestamp
    ? dayjs(message.timestamp).format('HH:mm')
    : ''

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className="max-w-[85%] rounded-xl px-4 py-3"
        style={{
          background: isUser
            ? 'var(--chat-user-message-bg-color)'
            : 'var(--md-bg-mute)'
        }}
      >
        <div className="flex items-center gap-2 mb-1.5 text-xs text-secondary">
          {isUser ? (
            <>
              <User size={14} />
              <span className="font-medium">{t('claudeCode.user')}</span>
            </>
          ) : (
            <>
              <Bot size={14} />
              <span className="font-medium">
                Claude{message.model ? ` (${message.model})` : ''}
              </span>
            </>
          )}
          {time && (
            <span className="ml-auto flex items-center gap-1">
              <Clock size={12} />
              {time}
            </span>
          )}
        </div>
        <div className="text-sm">
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <Markdown variant="chat">{message.content}</Markdown>
          )}
        </div>
        {!isUser && message.tokens && (
          <div className="mt-2 text-xs text-secondary text-right">
            {message.tokens.input + message.tokens.output} tokens
          </div>
        )}
      </div>
    </div>
  )
}

// Notification sound — short beep using Web Audio API
function playNotificationSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch {
    // Audio not available
  }
}

function showSystemNotification(title: string, body: string) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        new Notification(title, { body })
      }
    })
  }
}

// Cache of terminal instances per session so switching tabs doesn't kill the process
const terminalCache = new Map<
  string,
  {
    term: Terminal
    fitAddon: FitAddon
    status: 'connecting' | 'running' | 'exited' | 'error'
    errorMsg: string
  }
>()

// Cache for SSH terminal instances
const sshTerminalCache = new Map<
  string,
  {
    term: Terminal
    fitAddon: FitAddon
    terminalId: string | null
    status: 'connecting' | 'running' | 'exited' | 'error'
    errorMsg: string
  }
>()

export const SshTerminalView = ({ hostId }: { hostId: string }) => {
  const { t } = useTranslation()
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalIdRef = useRef<string | null>(null)
  const [status, setStatus] = useState<'connecting' | 'running' | 'exited' | 'error'>(
    'connecting'
  )
  const [errorMsg, setErrorMsg] = useState('')
  const [restartCount, setRestartCount] = useState(0)

  useEffect(() => {
    const container = terminalRef.current
    if (!container) return

    const cached = sshTerminalCache.get(hostId)

    if (cached && cached.status === 'running') {
      container.appendChild(cached.term.element!)
      setStatus(cached.status)
      setErrorMsg(cached.errorMsg)
      terminalIdRef.current = cached.terminalId

      requestAnimationFrame(() => {
        try {
          cached.fitAddon.fit()
        } catch {
          // ignore
        }
      })

      const resizeObserver = new ResizeObserver(() => {
        try {
          cached.fitAddon.fit()
        } catch {
          // ignore
        }
      })
      resizeObserver.observe(container)

      return () => {
        resizeObserver.disconnect()
        if (cached.term.element?.parentElement === container) {
          container.removeChild(cached.term.element)
        }
      }
    }

    if (cached) {
      cached.term.dispose()
      sshTerminalCache.delete(hostId)
      if (cached.terminalId) {
        ipcRenderer.invoke('ssh-host:killTerminal', cached.terminalId)
      }
    }

    const theme = getTerminalTheme()
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily:
        "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, monospace",
      theme,
      convertEol: true,
      scrollback: 10000,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    const unicode11 = new Unicode11Addon()
    term.loadAddon(fitAddon)
    term.loadAddon(unicode11)
    term.unicode.activeVersion = '11'
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const isMac = navigator.platform.startsWith('Mac')
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && e.key === 'c' && term.hasSelection()) {
        e.preventDefault()
        navigator.clipboard.writeText(term.getSelection())
        term.clearSelection()
        return false
      }
      if (mod && e.key === 'v') {
        e.preventDefault()
        navigator.clipboard.readText().then((text) => {
          const tid = terminalIdRef.current
          if (tid) {
            ipcRenderer.invoke('ssh-host:terminalInput', { terminalId: tid, data: text })
          }
        })
        return false
      }
      return true
    })
    term.open(container)

    const entry = {
      term,
      fitAddon,
      terminalId: null as string | null,
      status: 'connecting' as const,
      errorMsg: ''
    }
    sshTerminalCache.set(hostId, entry)

    const updateStatus = (s: typeof status, err = '') => {
      const e = sshTerminalCache.get(hostId)
      if (e) {
        ;(e as any).status = s
        e.errorMsg = err
      }
      setStatus(s)
      setErrorMsg(err)
    }

    term.onData((data) => {
      const tid = terminalIdRef.current
      if (tid) {
        ipcRenderer.invoke('ssh-host:terminalInput', { terminalId: tid, data })
      }
    })

    term.onResize(({ cols, rows }) => {
      const tid = terminalIdRef.current
      if (tid) {
        ipcRenderer.invoke('ssh-host:terminalResize', { terminalId: tid, cols, rows })
      }
    })

    const onData = (_: unknown, payload: { terminalId: string; data: string }) => {
      if (payload.terminalId === terminalIdRef.current) {
        term.write(payload.data)
        updateStatus('running')
      }
    }

    const onExit = (
      _: unknown,
      payload: { terminalId: string; code: number; error?: string }
    ) => {
      if (payload.terminalId === terminalIdRef.current) {
        if (payload.error) {
          updateStatus('error', payload.error)
          term.writeln(`\r\n\x1b[31m${payload.error}\x1b[0m`)
        } else {
          updateStatus('exited')
          term.writeln(
            `\r\n\x1b[90m[SSH session exited with code ${payload.code}]\x1b[0m`
          )
        }
      }
    }

    ipcRenderer.on('ssh-host:terminal-data', onData)
    ipcRenderer.on('ssh-host:terminal-exit', onExit)

    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
      } catch {
        // ignore
      }

      term.writeln('\x1b[90mConnecting...\x1b[0m\r\n')
      ipcRenderer
        .invoke('ssh-host:spawnSshTerminal', {
          hostId,
          cols: term.cols,
          rows: term.rows
        })
        .then((result: { success: boolean; terminalId?: string; error?: string }) => {
          if (result.success && result.terminalId) {
            terminalIdRef.current = result.terminalId
            entry.terminalId = result.terminalId
          } else if (!result.success) {
            updateStatus('error', result.error || 'Failed to connect')
          }
        })
        .catch((err: Error) => {
          updateStatus('error', err.message)
        })
    })

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {
        // ignore
      }
    })
    resizeObserver.observe(container)

    return () => {
      ipcRenderer.removeListener('ssh-host:terminal-data', onData)
      ipcRenderer.removeListener('ssh-host:terminal-exit', onExit)
      resizeObserver.disconnect()
      if (term.element?.parentElement === container) {
        container.removeChild(term.element)
      }
    }
  }, [hostId, restartCount])

  const handleRestart = useCallback(() => {
    const cached = sshTerminalCache.get(hostId)
    if (cached?.terminalId) {
      ipcRenderer.invoke('ssh-host:killTerminal', cached.terminalId)
    }
    if (cached) {
      cached.term.dispose()
      sshTerminalCache.delete(hostId)
    }
    terminalIdRef.current = null
    setRestartCount((c) => c + 1)
  }, [hostId])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {status === 'error' && (
        <div className="flex items-center justify-center flex-1 text-secondary">
          <div className="text-center space-y-3">
            <AlertCircle size={32} className="mx-auto opacity-40" />
            <p className="text-sm">{errorMsg || t('sshHost.connectionFailed')}</p>
          </div>
        </div>
      )}
      <div
        ref={terminalRef}
        className="flex-1 min-h-0"
        style={{ padding: '8px' }}
      />
      <div className="shrink-0 border-t border-theme px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-secondary">
          <TerminalIcon size={14} />
          <span>SSH</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors hover-bg text-secondary"
            title="Restart"
          >
            <RotateCw size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

// Cache for local terminal instances
const localTerminalCache = new Map<
  string,
  {
    term: Terminal
    fitAddon: FitAddon
    terminalId: string | null
    status: 'connecting' | 'running' | 'exited' | 'error'
    errorMsg: string
  }
>()

export const LocalTerminalView = ({ projectPath, initialCommand }: { projectPath: string; initialCommand?: string }) => {
  const { t } = useTranslation()
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalIdRef = useRef<string | null>(null)
  const [status, setStatus] = useState<'connecting' | 'running' | 'exited' | 'error'>(
    'connecting'
  )
  const [errorMsg, setErrorMsg] = useState('')
  const [restartCount, setRestartCount] = useState(0)

  useEffect(() => {
    const container = terminalRef.current
    if (!container) return

    const cached = localTerminalCache.get(projectPath)

    if (cached && cached.status === 'running') {
      container.appendChild(cached.term.element!)
      setStatus(cached.status)
      setErrorMsg(cached.errorMsg)
      terminalIdRef.current = cached.terminalId

      requestAnimationFrame(() => {
        try {
          cached.fitAddon.fit()
        } catch {
          // ignore
        }
      })

      const resizeObserver = new ResizeObserver(() => {
        try {
          cached.fitAddon.fit()
        } catch {
          // ignore
        }
      })
      resizeObserver.observe(container)

      return () => {
        resizeObserver.disconnect()
        if (cached.term.element?.parentElement === container) {
          container.removeChild(cached.term.element)
        }
      }
    }

    if (cached) {
      cached.term.dispose()
      localTerminalCache.delete(projectPath)
      if (cached.terminalId) {
        ipcRenderer.invoke('claude-code:killTerminal', cached.terminalId)
      }
    }

    const theme = getTerminalTheme()
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily:
        "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, monospace",
      theme,
      convertEol: true,
      scrollback: 10000,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    const unicode11 = new Unicode11Addon()
    term.loadAddon(fitAddon)
    term.loadAddon(unicode11)
    term.unicode.activeVersion = '11'
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const isMac = navigator.platform.startsWith('Mac')
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && e.key === 'c' && term.hasSelection()) {
        e.preventDefault()
        navigator.clipboard.writeText(term.getSelection())
        term.clearSelection()
        return false
      }
      if (mod && e.key === 'v') {
        e.preventDefault()
        navigator.clipboard.readText().then((text) => {
          const tid = terminalIdRef.current
          if (tid) {
            ipcRenderer.invoke('claude-code:terminalInput', { sessionId: tid, data: text })
          }
        })
        return false
      }
      return true
    })
    term.open(container)

    const terminalId = `local-${Date.now()}`
    const entry = {
      term,
      fitAddon,
      terminalId,
      status: 'connecting' as const,
      errorMsg: ''
    }
    localTerminalCache.set(projectPath, entry)

    const updateStatus = (s: typeof status, err = '') => {
      const e = localTerminalCache.get(projectPath)
      if (e) {
        ;(e as any).status = s
        e.errorMsg = err
      }
      setStatus(s)
      setErrorMsg(err)
    }

    term.onData((data) => {
      const tid = terminalIdRef.current
      if (tid) {
        ipcRenderer.invoke('claude-code:terminalInput', { sessionId: tid, data })
      }
    })

    term.onResize(({ cols, rows }) => {
      const tid = terminalIdRef.current
      if (tid) {
        ipcRenderer.invoke('claude-code:terminalResize', { sessionId: tid, cols, rows })
      }
    })

    const onData = (_: unknown, payload: { sessionId: string; data: string }) => {
      if (payload.sessionId === terminalIdRef.current) {
        term.write(payload.data)
        updateStatus('running')
      }
    }

    const onExit = (
      _: unknown,
      payload: { sessionId: string; code: number }
    ) => {
      if (payload.sessionId === terminalIdRef.current) {
        updateStatus('exited')
        term.writeln(
          `\r\n\x1b[90m[Terminal exited with code ${payload.code}]\x1b[0m`
        )
      }
    }

    ipcRenderer.on('claude-code:terminal-data', onData)
    ipcRenderer.on('claude-code:terminal-exit', onExit)

    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
      } catch {
        // ignore
      }

      ipcRenderer
        .invoke('claude-code:spawnLocalTerminal', {
          terminalId,
          cwd: projectPath,
          cols: term.cols,
          rows: term.rows
        })
        .then((result: { success: boolean; terminalId?: string; error?: string }) => {
          if (result.success && result.terminalId) {
            terminalIdRef.current = result.terminalId
            entry.terminalId = result.terminalId
            // Send initial command if provided
            if (initialCommand) {
              setTimeout(() => {
                ipcRenderer.invoke('claude-code:terminalInput', {
                  sessionId: result.terminalId,
                  data: initialCommand + '\r'
                })
              }, 300)
            }
          } else if (!result.success) {
            updateStatus('error', result.error || 'Failed to spawn terminal')
          }
        })
        .catch((err: Error) => {
          updateStatus('error', err.message)
        })
    })

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {
        // ignore
      }
    })
    resizeObserver.observe(container)

    return () => {
      ipcRenderer.removeListener('claude-code:terminal-data', onData)
      ipcRenderer.removeListener('claude-code:terminal-exit', onExit)
      resizeObserver.disconnect()
      if (term.element?.parentElement === container) {
        container.removeChild(term.element)
      }
    }
  }, [projectPath, restartCount])

  const handleRestart = useCallback(() => {
    const cached = localTerminalCache.get(projectPath)
    if (cached?.terminalId) {
      ipcRenderer.invoke('claude-code:killTerminal', cached.terminalId)
    }
    if (cached) {
      cached.term.dispose()
      localTerminalCache.delete(projectPath)
    }
    terminalIdRef.current = null
    setRestartCount((c) => c + 1)
  }, [projectPath])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {status === 'error' && (
        <div className="flex items-center justify-center flex-1 text-secondary">
          <div className="text-center space-y-3">
            <AlertCircle size={32} className="mx-auto opacity-40" />
            <p className="text-sm">{errorMsg || 'Failed to open terminal'}</p>
          </div>
        </div>
      )}
      <div
        ref={terminalRef}
        className="flex-1 min-h-0"
        style={{ padding: '8px' }}
      />
      <div className="shrink-0 border-t border-theme px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-secondary">
          <TerminalIcon size={14} />
          <span className="truncate" title={projectPath}>{projectPath}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors hover-bg text-secondary"
            title="Restart"
          >
            <RotateCw size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

const LiveView = ({
  sessionId,
  projectId,
  projectPath,
  hostId
}: {
  sessionId: string
  projectId?: string
  projectPath: string
  hostId?: string
}) => {
  const store = useStore()
  const { t } = useTranslation()
  const terminalRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'connecting' | 'running' | 'exited' | 'error'>(
    'connecting'
  )
  const [errorMsg, setErrorMsg] = useState('')
  const [restartCount, setRestartCount] = useState(0)

  useEffect(() => {
    const container = terminalRef.current
    if (!container) return

    const cached = terminalCache.get(sessionId)

    if (cached && cached.status === 'running') {
      // Re-attach existing running terminal
      container.appendChild(cached.term.element!)
      setStatus(cached.status)
      setErrorMsg(cached.errorMsg)

      // Clear attention since user is now viewing this tab
      store.centerTabs.setTabAttentionBySessionId(sessionId, false)

      requestAnimationFrame(() => {
        try {
          cached.fitAddon.fit()
        } catch {
          // ignore
        }
      })

      // Re-register attention listener for this cached terminal
      const onAttentionCached = (
        _: unknown,
        payload: { sessionId: string; type: 'permission' | 'completed' }
      ) => {
        if (payload.sessionId !== sessionId) return
        const activeTab = store.centerTabs.activeTab
        const isActive =
          activeTab?.type === 'session' && activeTab?.sessionId === sessionId
        if (!isActive) {
          store.centerTabs.setTabAttentionBySessionId(sessionId, true)
        }
        if (!document.hasFocus()) {
          playNotificationSound()
          showSystemNotification(
            'Claude Code',
            payload.type === 'permission' ? 'Waiting for your permission' : 'Task completed'
          )
        }
      }
      ipcRenderer.on('claude-code:terminal-attention', onAttentionCached)

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        try {
          cached.fitAddon.fit()
        } catch {
          // ignore
        }
      })
      resizeObserver.observe(container)

      return () => {
        resizeObserver.disconnect()
        ipcRenderer.removeListener('claude-code:terminal-attention', onAttentionCached)
        // Detach DOM but don't dispose — keep the terminal alive
        if (cached.term.element?.parentElement === container) {
          container.removeChild(cached.term.element)
        }
      }
    }

    // Clear stale cache (exited, error, or stuck connecting)
    if (cached) {
      cached.term.dispose()
      terminalCache.delete(sessionId)
      ipcRenderer.invoke('claude-code:killTerminal', sessionId)
    }

    // Create new terminal
    const theme = getTerminalTheme()
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily:
        "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, monospace",
      theme,
      convertEol: true,
      scrollback: 10000,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    const unicode11 = new Unicode11Addon()
    term.loadAddon(fitAddon)
    term.loadAddon(unicode11)
    term.unicode.activeVersion = '11'
    term.open(container)

    // Fix IME composition window position for CJK input
    const textarea = container.querySelector(
      '.xterm-helper-textarea'
    ) as HTMLTextAreaElement | null
    if (textarea) {
      const updateIMEPosition = () => {
        const cursorEl = container.querySelector('.xterm-cursor')
        if (cursorEl) {
          const rect = cursorEl.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          textarea.style.left = `${rect.left - containerRect.left}px`
          textarea.style.top = `${rect.top - containerRect.top}px`
          textarea.style.width = '1px'
          textarea.style.height = `${rect.height}px`
        }
      }
      textarea.addEventListener('compositionstart', updateIMEPosition)
      textarea.addEventListener('compositionupdate', updateIMEPosition)
    }

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const isMac = navigator.platform.startsWith('Mac')
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && e.key === 'c' && term.hasSelection()) {
        e.preventDefault()
        navigator.clipboard.writeText(term.getSelection())
        term.clearSelection()
        return false
      }
      if (mod && e.key === 'v') {
        e.preventDefault()
        navigator.clipboard.readText().then((text) => {
          ipcRenderer.invoke('claude-code:terminalInput', { sessionId, data: text })
        })
        return false
      }
      return true
    })

    const entry = {
      term,
      fitAddon,
      status: 'connecting' as const,
      errorMsg: ''
    }
    terminalCache.set(sessionId, entry)

    const updateStatus = (s: typeof status, err = '') => {
      const e = terminalCache.get(sessionId)
      if (e) {
        ;(e as any).status = s
        e.errorMsg = err
      }
      setStatus(s)
      setErrorMsg(err)
    }

    // Handle user input → send to PTY
    term.onData((data) => {
      ipcRenderer.invoke('claude-code:terminalInput', { sessionId, data })
    })

    // Sync resize to PTY
    term.onResize(({ cols, rows }) => {
      ipcRenderer.invoke('claude-code:terminalResize', { sessionId, cols, rows })
    })

    // Listen for terminal output
    const isNewConversation = sessionId.startsWith('new-')
    let hasRefreshedSessions = false
    // For new conversations: poll until we find the real session ID
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let pollCount = 0
    const MAX_POLLS = 15
    const POLL_INTERVAL = 2000
    const tryFindNewSession = async () => {
      pollCount++
      try {
        // Refresh using the projectId from the tab, not relying on activeProjectId
        const pid = projectId || store.claudeCode.state.activeProjectId
        const hid = hostId || store.claudeCode.state.activeHostId
        if (!pid) return false

        let sessions: IClaudeSession[]
        if (hid) {
          sessions = await ipcRenderer.invoke('ssh-host:getRemoteSessions', hid, pid)
        } else {
          sessions = await ipcRenderer.invoke('claude-code:getSessions', pid)
        }
        // Also update sidebar
        store.claudeCode.setState({ sessions: sessions || [] })

        // Find sessions that don't already have an open tab
        const openSessionIds = new Set(
          store.centerTabs.state.tabs
            .filter((t) => t.type === 'session' && t.sessionId !== sessionId)
            .map((t) => t.sessionId)
        )
        // Also exclude sessions already mapped from other new-* tabs
        const mappedRealIds = new Set(Object.values(store.claudeCode.state.newSessionMap))

        // Find the most recent session that isn't already open or mapped
        const candidates = (sessions || [])
          .filter((s: IClaudeSession) =>
            !openSessionIds.has(s.id) && !mappedRealIds.has(s.id)
          )
          .sort((a: IClaudeSession, b: IClaudeSession) =>
            (b.lastTimestamp || 0) - (a.lastTimestamp || 0)
          )

        const newSession = candidates[0]
        if (newSession) {
          // Update tab title
          const tab = store.centerTabs.state.tabs.find(
            (t) => t.type === 'session' && t.sessionId === sessionId
          )
          if (tab) {
            store.centerTabs.updateTabTitle(
              tab.id,
              newSession.firstMessage || 'Session'
            )
          }
          // Register fake→real mapping for sidebar highlight
          store.claudeCode.registerNewSession(sessionId, newSession.id)
          // Ensure sidebar shows this project's sessions and marks the new one active
          store.claudeCode.setState({
            activeProjectId: pid,
            activeHostId: hid || null,
            activeSessionId: newSession.id
          })
          return true
        }
      } catch {
        // ignore
      }
      return false
    }

    const startPollingForNewSession = () => {
      if (pollTimer) return
      pollTimer = setInterval(async () => {
        const found = await tryFindNewSession()
        if (found && pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
        if (pollCount >= MAX_POLLS && pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
      }, POLL_INTERVAL)
    }

    const onData = (_: unknown, payload: { sessionId: string; data: string }) => {
      if (payload.sessionId === sessionId) {
        term.write(payload.data)
        updateStatus('running')
        if (isNewConversation && !hasRefreshedSessions) {
          hasRefreshedSessions = true
          startPollingForNewSession()
        }
      }
    }

    const onExit = (
      _: unknown,
      payload: { sessionId: string; code: number; error?: string }
    ) => {
      if (payload.sessionId === sessionId) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
        if (payload.error) {
          updateStatus('error', payload.error)
          term.writeln(`\r\n\x1b[31m${payload.error}\x1b[0m`)
        } else {
          updateStatus('exited')
          term.writeln(
            `\r\n\x1b[90m[Process exited with code ${payload.code}]\x1b[0m`
          )
        }
        // Now safe to update sessionId (terminal is dead, no re-render risk)
        const realId = store.claudeCode.resolveSessionId(sessionId)
        if (realId !== sessionId) {
          const tab = store.centerTabs.state.tabs.find(
            (t) => t.type === 'session' && t.sessionId === sessionId
          )
          if (tab) {
            store.centerTabs.updateTabSessionId(tab.id, realId)
          }
        }
      }
    }

    // Listen for attention events (permission requests, task completion)
    const onAttention = (
      _: unknown,
      payload: { sessionId: string; type: 'permission' | 'completed' }
    ) => {
      if (payload.sessionId !== sessionId) return

      // Only notify if this tab is NOT currently active
      const activeTab = store.centerTabs.activeTab
      const isActiveSession =
        activeTab?.type === 'session' && activeTab?.sessionId === sessionId

      if (!isActiveSession) {
        // Set attention dot on the tab
        store.centerTabs.setTabAttentionBySessionId(sessionId, true)
      }

      // Always play sound and show notification (even if tab is active but window not focused)
      if (!document.hasFocus()) {
        playNotificationSound()
        if (payload.type === 'permission') {
          showSystemNotification('Claude Code', 'Waiting for your permission')
        } else {
          showSystemNotification('Claude Code', 'Task completed')
        }
      }
    }

    ipcRenderer.on('claude-code:terminal-data', onData)
    ipcRenderer.on('claude-code:terminal-exit', onExit)
    ipcRenderer.on('claude-code:terminal-attention', onAttention)

    // Fit then spawn
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
      } catch {
        // ignore
      }

      const isNewConversation = sessionId.startsWith('new-')
      const spawnChannel = hostId
        ? 'ssh-host:spawnRemoteClaudeTerminal'
        : 'claude-code:spawnTerminal'
      const spawnCmd = isNewConversation
        ? (hostId ? `$ ssh ... -- claude` : `$ claude`)
        : (hostId
          ? `$ ssh ... -- claude --resume ${sessionId}`
          : `$ claude --resume ${sessionId}`)
      term.writeln(`\x1b[90m${spawnCmd}\x1b[0m\r\n`)
      ipcRenderer
        .invoke(spawnChannel, {
          sessionId,
          projectPath,
          projectId: store.claudeCode.state.activeProjectId,
          hostId,
          cols: term.cols,
          rows: term.rows,
          newConversation: isNewConversation
        })
        .then((result: { success: boolean; error?: string }) => {
          if (!result.success) {
            updateStatus('error', result.error || 'Failed to spawn terminal')
          }
        })
        .catch((err: Error) => {
          updateStatus('error', err.message)
        })
    })

    // Handle container resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {
        // ignore
      }
    })
    resizeObserver.observe(container)

    return () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
      // Detach listeners but do NOT kill the process or dispose the terminal
      ipcRenderer.removeListener('claude-code:terminal-data', onData)
      ipcRenderer.removeListener('claude-code:terminal-exit', onExit)
      ipcRenderer.removeListener('claude-code:terminal-attention', onAttention)
      resizeObserver.disconnect()
      // Detach DOM but keep alive
      if (term.element?.parentElement === container) {
        container.removeChild(term.element)
      }
    }
  }, [sessionId, projectPath, hostId, restartCount])

  const handleStop = useCallback(() => {
    ipcRenderer.invoke('claude-code:killTerminal', sessionId)
    const cached = terminalCache.get(sessionId)
    if (cached) {
      cached.term.dispose()
      terminalCache.delete(sessionId)
    }
    setStatus('exited')
  }, [sessionId])

  const handleRestart = useCallback(() => {
    ipcRenderer.invoke('claude-code:killTerminal', sessionId)
    const cached = terminalCache.get(sessionId)
    if (cached) {
      cached.term.dispose()
      terminalCache.delete(sessionId)
    }
    // Force re-mount by updating key
    setRestartCount((c) => c + 1)
  }, [sessionId])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {status === 'error' && (
        <div className="flex items-center justify-center flex-1 text-secondary">
          <div className="text-center space-y-3">
            <AlertCircle size={32} className="mx-auto opacity-40" />
            <p className="text-sm">{errorMsg || t('claudeCode.cliNotFound')}</p>
          </div>
        </div>
      )}
      <div
        ref={terminalRef}
        className="flex-1 min-h-0"
        style={{ padding: '8px' }}
      />
      <div className="shrink-0 border-t border-theme px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-secondary">
          <TerminalIcon size={14} />
          <span>{t('claudeCode.live')}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors hover-bg text-secondary"
            title="Restart"
          >
            <RotateCw size={12} />
          </button>
          {status === 'running' && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors bg-red-500 text-white hover:bg-red-600"
              title="Stop"
            >
              <Square size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const PAGE_SIZE = 50

const HistoryView = ({
  sessionId,
  projectId,
  hostId
}: {
  sessionId: string
  projectId: string | null
  hostId?: string
}) => {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevSessionId = useRef<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const offsetRef = useRef(0)

  // Load messages for this specific session
  useEffect(() => {
    let cancelled = false
    setMessages([])
    setLoading(true)
    offsetRef.current = 0

    const channel = hostId
      ? 'ssh-host:getRemoteSessionMessages'
      : 'claude-code:getSessionMessages'
    const args = hostId
      ? [channel, hostId, projectId, sessionId, 0, PAGE_SIZE]
      : [channel, projectId, sessionId, 0, PAGE_SIZE]
    ipcRenderer
      .invoke(...(args as [string, ...any[]]))
      .then((msgs: any[]) => {
        if (cancelled) return
        setMessages(msgs || [])
        setHasMore((msgs?.length || 0) >= PAGE_SIZE)
        offsetRef.current = PAGE_SIZE
      })
      .catch(() => {
        if (!cancelled) setMessages([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [sessionId, projectId, hostId])

  // Auto-scroll on first load
  useEffect(() => {
    if (sessionId && sessionId !== prevSessionId.current && messages.length > 0) {
      prevSessionId.current = sessionId
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [sessionId, messages.length])

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return
    setLoading(true)
    const channel = hostId
      ? 'ssh-host:getRemoteSessionMessages'
      : 'claude-code:getSessionMessages'
    const loadArgs = hostId
      ? [channel, hostId, projectId, sessionId, offsetRef.current, PAGE_SIZE]
      : [channel, projectId, sessionId, offsetRef.current, PAGE_SIZE]
    ipcRenderer
      .invoke(...(loadArgs as [string, ...any[]]))
      .then((newMsgs: any[]) => {
        setMessages((prev) => [...prev, ...(newMsgs || [])])
        setHasMore((newMsgs?.length || 0) >= PAGE_SIZE)
        offsetRef.current += PAGE_SIZE
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [loading, hasMore, projectId, sessionId, hostId])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      {hasMore && (
        <div className="flex justify-center mb-4">
          <button
            className="text-sm accent-text accent-text-hover px-3 py-1.5 rounded-md hover-bg transition-colors"
            onClick={loadMore}
          >
            {t('claudeCode.loadEarlier')}
          </button>
        </div>
      )}

      {loading && messages.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-secondary" />
        </div>
      ) : (
        messages.map((msg: any, i: number) => (
          <MessageBubble key={msg.uuid || i} message={msg} />
        ))
      )}

      <div ref={bottomRef} />
    </div>
  )
}

interface SessionViewProps {
  sessionId?: string
  projectId?: string
  hostId?: string
}

export const SessionView = observer(({ sessionId, projectId, hostId }: SessionViewProps) => {
  const store = useStore()
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState<ViewMode>('live')

  const state = store.claudeCode.state
  const effectiveSessionId = sessionId ?? state.activeSessionId
  const effectiveProjectId = projectId ?? state.activeProjectId
  // Find project from either local projects or grouped (remote) projects
  let activeProject: IClaudeProject | null = null
  if (effectiveProjectId) {
    activeProject = store.claudeCode.state.projects.find((p) => p.id === effectiveProjectId) || null
    if (!activeProject) {
      // Check remote projects in grouped list
      for (const group of store.claudeCode.groupedProjects) {
        const found = group.projects.find((p) => p.id === effectiveProjectId)
        if (found) {
          activeProject = found
          break
        }
      }
    }
  } else {
    activeProject = store.claudeCode.activeProject
  }

  const isNewConversation = effectiveSessionId?.startsWith('new-')

  if (!effectiveSessionId) {
    return <EmptyState />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with mode toggle */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-theme shrink-0">
        <ProjectBadge projectId={effectiveProjectId} hostId={hostId} />
        <span className="text-sm font-medium truncate md-text flex-1">
          {activeProject?.path ?? ''}
        </span>

        {!isNewConversation && (
          <div
            className="flex items-center rounded-md overflow-hidden border border-theme"
            style={{ background: 'var(--md-bg-mute)' }}
          >
            <button
              className={
                'flex items-center gap-1 px-2.5 py-1 text-xs transition-colors ' +
                (viewMode === 'live' ? 'md-text' : 'text-secondary')
              }
              style={
                viewMode === 'live' ? { background: 'var(--active-bg)' } : undefined
              }
              onClick={() => setViewMode('live')}
            >
              <Play size={12} />
              {t('claudeCode.live')}
            </button>
            <button
              className={
                'flex items-center gap-1 px-2.5 py-1 text-xs transition-colors ' +
                (viewMode === 'history' ? 'md-text' : 'text-secondary')
              }
              style={
                viewMode === 'history'
                  ? { background: 'var(--active-bg)' }
                  : undefined
              }
              onClick={() => setViewMode('history')}
            >
              <History size={12} />
              {t('claudeCode.history')}
            </button>
          </div>
        )}
      </div>

      {(viewMode === 'live' || isNewConversation) && activeProject?.path ? (
        <LiveView
          key={effectiveSessionId}
          sessionId={effectiveSessionId}
          projectId={effectiveProjectId || undefined}
          projectPath={activeProject.path}
          hostId={hostId}
        />
      ) : (
        <HistoryView
          sessionId={effectiveSessionId}
          projectId={effectiveProjectId}
          hostId={hostId}
        />
      )}
    </div>
  )
})

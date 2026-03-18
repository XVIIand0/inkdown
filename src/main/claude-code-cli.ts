import { ipcMain, BrowserWindow } from 'electron'
import { spawn, execFile, ChildProcess } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'
// Lazy-load node-pty to avoid crashing main process if it fails
let pty: typeof import('node-pty') | null = null
function getPty(): typeof import('node-pty') {
  if (!pty) {
    pty = require('node-pty')
  }
  return pty!
}

function getClaudePath(): string {
  if (process.platform === 'win32') {
    const localExe = join(homedir(), '.local', 'bin', 'claude.exe')
    if (existsSync(localExe)) return localExe
    const localCmd = join(homedir(), '.claude', 'local', 'claude.cmd')
    if (existsSync(localCmd)) return localCmd
  } else {
    // macOS/Linux: check common install locations since PATH may be minimal
    // when app is launched from Finder/dock
    const candidates = [
      join(homedir(), '.local', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude'
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
  }
  return 'claude'
}

// PTY terminal processes — real pseudo-terminal for interactive claude sessions
export const terminalProcesses = new Map<string, any>()

// Strip Claude session env vars so spawned processes don't think they're nested
function getCleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  // Ensure common bin paths are in PATH (Finder-launched apps have minimal PATH)
  const extraPaths = [
    join(homedir(), '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin'
  ]
  const currentPath = env.PATH || ''
  const missing = extraPaths.filter((p) => !currentPath.includes(p))
  if (missing.length) {
    env.PATH = [...missing, currentPath].join(':')
  }
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE')) {
      delete env[key]
    }
  }
  return env
}

ipcMain.handle('claude-code:checkCli', async () => {
  return new Promise<{ available: boolean; version?: string }>((resolve) => {
    const claudePath = getClaudePath()
    execFile(claudePath, ['--version'], { shell: true, timeout: 10000 }, (error, stdout) => {
      if (error) {
        resolve({ available: false })
      } else {
        resolve({ available: true, version: stdout.trim() })
      }
    })
  })
})

ipcMain.handle(
  'claude-code:runPrompt',
  async (
    event,
    options: {
      prompt: string
      projectPath: string
      sessionId?: string
    }
  ) => {
    const claudePath = getClaudePath()
    const args = ['-p', options.prompt, '--output-format', 'stream-json']
    if (options.sessionId) {
      args.push('--resume', options.sessionId)
    }

    return new Promise<{ success: boolean; result?: string; error?: string }>((resolve) => {
      let stdout = ''
      let stderr = ''

      const child = spawn(claudePath, args, {
        cwd: options.projectPath,
        shell: process.platform === 'win32',
        env: getCleanEnv()
      })

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString()
        stdout += chunk
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win && !win.isDestroyed()) {
          event.sender.send('claude-code:stream', chunk)
        }
      })

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      child.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, result: stdout })
        } else {
          resolve({
            success: false,
            error: stderr || `Process exited with code ${code}`
          })
        }
      })
    })
  }
)

// Keep track of active resume processes
const activeProcesses = new Map<string, ChildProcess>()

ipcMain.handle(
  'claude-code:resumeSession',
  async (
    event,
    options: {
      sessionId: string
      projectPath: string
      prompt: string
    }
  ) => {
    const claudePath = getClaudePath()
    const args = [
      '-p', options.prompt,
      '--resume', options.sessionId,
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions'
    ]

    // Kill existing process for this session if any
    const existing = activeProcesses.get(options.sessionId)
    if (existing) {
      existing.kill()
      activeProcesses.delete(options.sessionId)
    }

    return new Promise<{ success: boolean; result?: string; error?: string }>((resolve) => {
      let stdout = ''
      let stderr = ''

      const child = spawn(claudePath, args, {
        cwd: options.projectPath,
        shell: process.platform === 'win32',
        env: getCleanEnv()
      })

      activeProcesses.set(options.sessionId, child)

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString()
        stdout += chunk
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win && !win.isDestroyed()) {
          event.sender.send('claude-code:resume-stream', chunk)
        }
      })

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      child.on('error', (err) => {
        activeProcesses.delete(options.sessionId)
        resolve({ success: false, error: err.message })
      })

      child.on('close', (code) => {
        activeProcesses.delete(options.sessionId)
        if (code === 0) {
          resolve({ success: true, result: stdout })
        } else {
          resolve({
            success: false,
            error: stderr || `Process exited with code ${code}`
          })
        }
      })
    })
  }
)

ipcMain.handle('claude-code:killSession', async (_, sessionId: string) => {
  const proc = activeProcesses.get(sessionId)
  if (proc) {
    proc.kill()
    activeProcesses.delete(sessionId)
    return true
  }
  return false
})

// ─── Interactive Terminal Mode (node-pty) ───

ipcMain.handle(
  'claude-code:spawnTerminal',
  async (
    event,
    options: {
      sessionId: string
      projectPath: string
      cols?: number
      rows?: number
      newConversation?: boolean
    }
  ) => {
    const claudePath = getClaudePath()

    // Kill existing terminal for this session
    const existing = terminalProcesses.get(options.sessionId)
    if (existing) {
      existing.kill()
      terminalProcesses.delete(options.sessionId)
    }

    const sendToRenderer = (channel: string, data: unknown) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win && !win.isDestroyed()) {
          event.sender.send(channel, data)
        }
      } catch {
        // Window may have been closed
      }
    }

    const claudeArgs = options.newConversation ? [] : ['--resume', options.sessionId]

    let ptyProcess: any
    try {
      ptyProcess = getPty().spawn(claudePath, claudeArgs, {
        name: 'xterm-256color',
        cols: options.cols || 120,
        rows: options.rows || 30,
        cwd: options.projectPath,
        env: {
          ...getCleanEnv(),
          FORCE_COLOR: '1',
          TERM: 'xterm-256color',
          LANG: 'en_US.UTF-8',
          LC_ALL: 'en_US.UTF-8'
        } as Record<string, string>
      })
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to spawn PTY' }
    }

    terminalProcesses.set(options.sessionId, ptyProcess)

    // Buffer recent output for pattern detection
    let outputBuffer = ''
    const BUFFER_MAX = 2000

    // Patterns that indicate Claude is waiting for permission
    const permissionPatterns = [
      /Do you want to proceed\?/i,
      /\(Y\)es\b/i,
      /\by\/n\b/i,
      /Allow\s+(once|always)\b/i,
      /Approve\?/i,
      /Press Enter to/i,
      /waiting for.*permission/i
    ]

    ptyProcess.onData((data: string) => {
      sendToRenderer('claude-code:terminal-data', {
        sessionId: options.sessionId,
        data
      })

      // Accumulate for pattern matching
      outputBuffer += data
      if (outputBuffer.length > BUFFER_MAX) {
        outputBuffer = outputBuffer.slice(-BUFFER_MAX)
      }

      // Strip ANSI escape sequences for matching
      const clean = outputBuffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')

      for (const pat of permissionPatterns) {
        if (pat.test(clean)) {
          sendToRenderer('claude-code:terminal-attention', {
            sessionId: options.sessionId,
            type: 'permission'
          })
          outputBuffer = '' // Reset so we don't fire repeatedly
          break
        }
      }
    })

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      terminalProcesses.delete(options.sessionId)
      sendToRenderer('claude-code:terminal-exit', {
        sessionId: options.sessionId,
        code: exitCode
      })
      // Task finished
      sendToRenderer('claude-code:terminal-attention', {
        sessionId: options.sessionId,
        type: 'completed'
      })
    })

    return { success: true }
  }
)

ipcMain.handle(
  'claude-code:terminalInput',
  async (_, options: { sessionId: string; data: string }) => {
    const proc = terminalProcesses.get(options.sessionId)
    if (proc) {
      proc.write(options.data)
      return true
    }
    return false
  }
)

ipcMain.handle(
  'claude-code:terminalResize',
  async (_, options: { sessionId: string; cols: number; rows: number }) => {
    const proc = terminalProcesses.get(options.sessionId)
    if (proc) {
      proc.resize(options.cols, options.rows)
      return true
    }
    return false
  }
)

ipcMain.handle('claude-code:killTerminal', async (_, sessionId: string) => {
  const proc = terminalProcesses.get(sessionId)
  if (proc) {
    proc.kill()
    terminalProcesses.delete(sessionId)
    return true
  }
  return false
})

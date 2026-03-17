import { ipcMain, BrowserWindow } from 'electron'
import { spawn, execFile } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'
import { knex } from './database/model'
import { terminalProcesses } from './claude-code-cli'
import {
  extractFirstUserMessage,
  extractLastTimestamp,
  parseSessionMessages
} from './claude-code-parser'

function getSshPath(): string {
  if (process.platform === 'win32') {
    const systemSsh = join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'OpenSSH',
      'ssh.exe'
    )
    if (existsSync(systemSsh)) return systemSsh
  }
  return 'ssh'
}

// Lazy-load node-pty to avoid crashing main process if it fails
let pty: typeof import('node-pty') | null = null
function getPty(): typeof import('node-pty') {
  if (!pty) {
    pty = require('node-pty')
  }
  return pty!
}

// Strip Claude session env vars so spawned processes don't think they're nested
function getCleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE')) {
      delete env[key]
    }
  }
  return env
}

function buildSshArgs(host: ISshHost): string[] {
  const args: string[] = []
  args.push('-p', String(host.port))
  if (host.authMethod === 'key' && host.identityFile) {
    args.push('-i', host.identityFile)
  }
  args.push('-o', 'StrictHostKeyChecking=accept-new')
  args.push(`${host.username}@${host.hostname}`)
  return args
}

function sshExec(
  host: ISshHost,
  command: string,
  timeout: number = 30000
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const args = buildSshArgs(host)
    args.push('--', command)

    let stdout = ''
    let stderr = ''

    // execFile passes arguments directly to the executable without shell
    // interpretation. For complex scripts, we base64-encode the command and
    // have the remote decode+execute it, avoiding any argument mangling.
    execFile(getSshPath(), args, {
      timeout,
      maxBuffer: 50 * 1024 * 1024, // 50MB for large session files
      encoding: 'buffer'
    }, (error, stdoutBuf, stderrBuf) => {
      stdout = (stdoutBuf as Buffer)?.toString('utf-8') || ''
      stderr = (stderrBuf as Buffer)?.toString('utf-8') || ''
      if (error && !stdout) {
        stderr = error.message
      }
      resolve({ stdout, stderr, code: error ? (error as any).code ?? 1 : 0 })
    })
  })
}


function decodeProjectDirName(dirName: string): string {
  const sepIndex = dirName.indexOf('--')
  if (sepIndex === -1) return dirName.replace(/-/g, '/')
  const drive = dirName.substring(0, sepIndex)
  const rest = dirName.substring(sepIndex + 2)
  return drive + ':\\' + rest.replace(/-/g, '\\')
}

async function getHostById(id: string): Promise<ISshHost> {
  const host = await knex('ssh_host').where('id', id).first()
  if (!host) throw new Error(`SSH host not found: ${id}`)
  return host as ISshHost
}

// PTY terminal processes for SSH sessions
const sshTerminalProcesses = new Map<string, any>()

ipcMain.handle('ssh-host:test', async (_, id: string) => {
  const host = await getHostById(id)
  const start = Date.now()
  return new Promise<ISshTestResult>((resolve) => {
    const args = buildSshArgs(host)
    // Insert batch mode and connect timeout before user@host
    const userHostIdx = args.length - 1
    const userHost = args[userHostIdx]
    const testArgs = [
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=5',
      ...args.slice(0, userHostIdx),
      userHost,
      '--', 'exit'
    ]

    const child = spawn(getSshPath(), testArgs, {
      timeout: 10000,
      env: getCleanEnv()
    })

    let stderr = ''

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })

    child.on('close', (code) => {
      const latencyMs = Date.now() - start
      if (code === 0) {
        resolve({ success: true, latencyMs })
      } else {
        resolve({ success: false, error: stderr || `SSH exited with code ${code}`, latencyMs })
      }
    })
  })
})

ipcMain.handle('ssh-host:testConnection', async (_, hostData: Partial<ISshHost>) => {
  const host = {
    id: '',
    name: '',
    hostname: hostData.hostname || '',
    port: hostData.port || 22,
    username: hostData.username || '',
    authMethod: hostData.authMethod || 'key',
    identityFile: hostData.identityFile,
    password: hostData.password,
    iconType: 'default' as const,
    sort: 0,
    created: 0,
    updated: 0
  }
  const start = Date.now()
  return new Promise<ISshTestResult>((resolve) => {
    const args = buildSshArgs(host)
    const userHostIdx = args.length - 1
    const userHost = args[userHostIdx]
    const testArgs = [
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=5',
      ...args.slice(0, userHostIdx),
      userHost,
      '--', 'exit'
    ]

    const child = spawn(getSshPath(), testArgs, {
      timeout: 10000,
      env: getCleanEnv()
    })

    let stderr = ''

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })

    child.on('close', (code) => {
      const latencyMs = Date.now() - start
      if (code === 0) {
        resolve({ success: true, latencyMs })
      } else {
        resolve({ success: false, error: stderr || `SSH exited with code ${code}`, latencyMs })
      }
    })
  })
})

ipcMain.handle('ssh-host:getRemoteProjects', async (_, hostId: string) => {
  const host = await getHostById(hostId)
  const result = await sshExec(host, 'ls -1 ~/.claude/projects/ 2>/dev/null')
  if (!result.stdout.trim()) return []

  const dirs = result.stdout.trim().split('\n').filter((d) => d.trim())
  return dirs.map((dirName) => ({
    id: dirName,
    name: dirName,
    path: decodeProjectDirName(dirName),
    sessionCount: 0,
    hasMemory: false,
    hostId: host.id
  }))
})

ipcMain.handle(
  'ssh-host:getRemoteSessions',
  async (_, hostId: string, projectId: string) => {
    const host = await getHostById(hostId)
    const projDir = `~/.claude/projects/${projectId}`

    const script =
      `cd ${projDir} 2>/dev/null || exit 0; ` +
      `for f in *.jsonl; do ` +
      `[ -f "$f" ] || continue; ` +
      `echo "===FILE===$f"; ` +
      `wc -l < "$f" 2>/dev/null; ` +
      `echo "===HEAD==="; ` +
      `head -80 "$f" 2>/dev/null | base64; ` +
      `echo "===TAIL==="; ` +
      `tail -1 "$f" 2>/dev/null | base64; ` +
      `echo "===END==="; ` +
      `done`

    const result = await sshExec(host, script, 60000)
    if (!result.stdout.trim()) return []

    const sessions: Array<{
      id: string
      firstMessage: string
      lastTimestamp: string
      messageCount: number
    }> = []

    // Parse the structured output
    const fileBlocks = result.stdout.split('===FILE===').filter((b) => b.trim())

    for (const block of fileBlocks) {
      const lines = block.split('\n')
      const fileName = (lines[0] || '').trim()
      if (!fileName.endsWith('.jsonl')) continue

      const id = fileName.replace('.jsonl', '')
      let firstMessage = ''
      let lastTimestamp = ''
      let messageCount = 0

      // Find sections
      const fullBlock = block
      const headIdx = fullBlock.indexOf('===HEAD===')
      const tailIdx = fullBlock.indexOf('===TAIL===')
      const endIdx = fullBlock.indexOf('===END===')

      if (headIdx === -1 || tailIdx === -1 || endIdx === -1) {
        sessions.push({ id, firstMessage, lastTimestamp, messageCount })
        continue
      }

      // Line count is between filename and ===HEAD===
      const countStr = fullBlock.substring(lines[0].length + 1, headIdx).trim()
      messageCount = parseInt(countStr, 10) || 0

      // Head content (base64) — decode and use shared parser for firstMessage
      const headB64 = fullBlock.substring(headIdx + '===HEAD==='.length, tailIdx).trim()
      if (headB64) {
        try {
          const headContent = Buffer.from(headB64, 'base64').toString('utf-8')
          const headLines = headContent.split('\n').filter((l) => l.trim())
          firstMessage = extractFirstUserMessage(headLines)
        } catch {}
      }

      // Tail content (base64) — decode and use shared parser for timestamp
      const tailB64 = fullBlock.substring(tailIdx + '===TAIL==='.length, endIdx).trim()
      if (tailB64) {
        try {
          const tailContent = Buffer.from(tailB64, 'base64').toString('utf-8').trim()
          lastTimestamp = extractLastTimestamp(tailContent)
        } catch {}
      }

      sessions.push({ id, firstMessage, lastTimestamp, messageCount })
    }

    return sessions
  }
)

ipcMain.handle(
  'ssh-host:getRemoteSessionMessages',
  async (
    _,
    hostId: string,
    projectId: string,
    sessionId: string,
    offset: number = 0,
    limit: number = 100
  ) => {
    const host = await getHostById(hostId)
    const fp = `~/.claude/projects/${projectId}/${sessionId}.jsonl`
    const result = await sshExec(
      host,
      `cat ${fp} 2>/dev/null | base64`,
      60000
    )
    if (!result.stdout.trim()) return []

    let content: string
    try {
      content = Buffer.from(result.stdout.trim(), 'base64').toString('utf-8')
    } catch {
      return []
    }

    const lines = content.split('\n').filter((l) => l.trim())
    return parseSessionMessages(lines, offset, limit)
  }
)

ipcMain.handle(
  'ssh-host:spawnSshTerminal',
  async (
    event,
    options: {
      hostId: string
      host?: ISshHost
      cols?: number
      rows?: number
    }
  ) => {
    const host = options.host || (await getHostById(options.hostId))
    const terminalId = `ssh-${options.hostId}-${Date.now()}`

    // Kill existing terminal for this host
    const existing = sshTerminalProcesses.get(options.hostId)
    if (existing) {
      existing.kill()
      sshTerminalProcesses.delete(options.hostId)
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

    const sshArgs = buildSshArgs(host)

    let ptyProcess: any
    try {
      ptyProcess = getPty().spawn(getSshPath(), sshArgs, {
        name: 'xterm-256color',
        cols: options.cols || 120,
        rows: options.rows || 30,
        cwd: homedir(),
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

    sshTerminalProcesses.set(terminalId, ptyProcess)

    ptyProcess.onData((data: string) => {
      sendToRenderer('ssh-host:terminal-data', {
        terminalId,
        data
      })
    })

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      sshTerminalProcesses.delete(terminalId)
      sendToRenderer('ssh-host:terminal-exit', {
        terminalId,
        code: exitCode
      })
    })

    return { success: true, terminalId }
  }
)

ipcMain.handle(
  'ssh-host:spawnRemoteClaudeTerminal',
  async (
    event,
    options: {
      hostId: string
      host?: ISshHost
      sessionId: string
      projectId?: string
      cols?: number
      rows?: number
      newConversation?: boolean
    }
  ) => {
    const host = options.host || (await getHostById(options.hostId))
    const terminalId = `ssh-claude-${options.hostId}-${options.sessionId}`

    // Kill existing terminal for this session
    const existing = sshTerminalProcesses.get(terminalId)
    if (existing) {
      existing.kill()
      sshTerminalProcesses.delete(terminalId)
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

    const sshArgs = buildSshArgs(host)
    // Insert -t for forced pseudo-terminal allocation before user@host
    const userHostIdx = sshArgs.length - 1
    const userHost = sshArgs[userHostIdx]

    let remoteCmd: string
    if (options.newConversation && options.projectId) {
      const projPath = decodeProjectDirName(options.projectId)
      remoteCmd = `cd ${projPath} 2>/dev/null; exec ~/.local/bin/claude 2>/dev/null || exec claude`
    } else {
      remoteCmd = `exec ~/.local/bin/claude --resume ${options.sessionId} 2>/dev/null || exec claude --resume ${options.sessionId}`
    }
    const ptyArgs = [
      '-t',
      ...sshArgs.slice(0, userHostIdx),
      userHost,
      remoteCmd
    ]

    let ptyProcess: any
    try {
      ptyProcess = getPty().spawn(getSshPath(), ptyArgs, {
        name: 'xterm-256color',
        cols: options.cols || 120,
        rows: options.rows || 30,
        cwd: homedir(),
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

    sshTerminalProcesses.set(terminalId, ptyProcess)

    // Also register in shared terminalProcesses so claude-code:terminalInput/Resize handlers work
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
      // Send on claude-code channels with sessionId so LiveView can receive
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
      sshTerminalProcesses.delete(terminalId)
      terminalProcesses.delete(options.sessionId)
      sendToRenderer('claude-code:terminal-exit', {
        sessionId: options.sessionId,
        code: exitCode
      })
      sendToRenderer('claude-code:terminal-attention', {
        sessionId: options.sessionId,
        type: 'completed'
      })
    })

    return { success: true, terminalId }
  }
)

ipcMain.handle(
  'ssh-host:terminalInput',
  async (_, options: { terminalId: string; data: string }) => {
    const proc = sshTerminalProcesses.get(options.terminalId)
    if (proc) {
      proc.write(options.data)
      return true
    }
    return false
  }
)

ipcMain.handle(
  'ssh-host:terminalResize',
  async (_, options: { terminalId: string; cols: number; rows: number }) => {
    const proc = sshTerminalProcesses.get(options.terminalId)
    if (proc) {
      proc.resize(options.cols, options.rows)
      return true
    }
    return false
  }
)

ipcMain.handle('ssh-host:killTerminal', async (_, terminalId: string) => {
  const proc = sshTerminalProcesses.get(terminalId)
  if (proc) {
    proc.kill()
    sshTerminalProcesses.delete(terminalId)
    return true
  }
  return false
})

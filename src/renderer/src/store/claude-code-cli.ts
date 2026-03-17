import { Store } from './store'
import { StructStore } from './struct'

const ipcRenderer = window.electron.ipcRenderer

interface StreamMessage {
  type: string
  content?: string
  tool_name?: string
  tool_input?: any
  result?: string
  timestamp?: string
}

const state = {
  available: false,
  version: '' as string,
  running: false,
  currentOutput: '',
  error: '' as string,
  // Resume mode
  resumeRunning: false,
  resumeOutput: '' as string,
  resumeMessages: [] as Array<{ role: string; content: string; timestamp: number }>,
  resumeError: '' as string
}

export class ClaudeCodeCliStore extends StructStore<typeof state> {
  private streamHandler: ((_: unknown, chunk: string) => void) | null = null
  private resumeHandler: ((_: unknown, chunk: string) => void) | null = null

  constructor(private readonly store: Store) {
    super(state)
  }

  async checkAvailability() {
    try {
      const result: { available: boolean; version?: string } =
        await ipcRenderer.invoke('claude-code:checkCli')
      this.setState({
        available: result.available,
        version: result.version || ''
      })
    } catch {
      this.setState({ available: false, version: '' })
    }
  }

  async runPrompt(prompt: string, projectPath: string, sessionId?: string) {
    if (this.state.running) return
    this.setState({ running: true, currentOutput: '', error: '' })

    this.streamHandler = (_: unknown, chunk: string) => {
      this.parseStreamChunk(chunk, 'prompt')
    }
    ipcRenderer.on('claude-code:stream', this.streamHandler)

    try {
      const result: { success: boolean; result?: string; error?: string } =
        await ipcRenderer.invoke('claude-code:runPrompt', {
          prompt,
          projectPath,
          sessionId
        })
      if (!result.success) {
        this.setState({ error: result.error || 'Unknown error' })
      }
    } catch (e: any) {
      this.setState({ error: e?.message || 'Failed to run prompt' })
    } finally {
      this.cleanupStream()
      this.setState({ running: false })
    }
  }

  async resumeSession(sessionId: string, projectPath: string, prompt: string) {
    if (this.state.resumeRunning) return
    this.setState({ resumeRunning: true, resumeError: '' })

    // Add user message immediately
    this.setState((s) => {
      s.resumeMessages = [
        ...s.resumeMessages,
        { role: 'user', content: prompt, timestamp: Date.now() }
      ]
    })

    this.resumeHandler = (_: unknown, chunk: string) => {
      this.parseStreamChunk(chunk, 'resume')
    }
    ipcRenderer.on('claude-code:resume-stream', this.resumeHandler)

    try {
      const result: { success: boolean; result?: string; error?: string } =
        await ipcRenderer.invoke('claude-code:resumeSession', {
          sessionId,
          projectPath,
          prompt
        })
      if (!result.success) {
        this.setState({ resumeError: result.error || 'Unknown error' })
      }
    } catch (e: any) {
      this.setState({ resumeError: e?.message || 'Failed to resume session' })
    } finally {
      this.cleanupResume()
      this.setState({ resumeRunning: false })
    }
  }

  private parseStreamChunk(rawChunk: string, mode: 'prompt' | 'resume') {
    // stream-json outputs one JSON per line
    const lines = rawChunk.split('\n').filter((l) => l.trim())
    for (const line of lines) {
      try {
        const msg: StreamMessage = JSON.parse(line)
        if (msg.type === 'assistant' && msg.content) {
          if (mode === 'resume') {
            this.setState((s) => {
              // Append to last assistant message or create new one
              const last = s.resumeMessages[s.resumeMessages.length - 1]
              if (last && last.role === 'assistant') {
                last.content += msg.content
              } else {
                s.resumeMessages.push({
                  role: 'assistant',
                  content: msg.content || '',
                  timestamp: Date.now()
                })
              }
            })
          } else {
            this.setState((s) => {
              s.currentOutput += msg.content
            })
          }
        } else if (msg.type === 'result' && msg.result) {
          if (mode === 'resume') {
            this.setState((s) => {
              const last = s.resumeMessages[s.resumeMessages.length - 1]
              if (last && last.role === 'assistant') {
                last.content = msg.result!
              } else {
                s.resumeMessages.push({
                  role: 'assistant',
                  content: msg.result!,
                  timestamp: Date.now()
                })
              }
            })
          } else {
            this.setState({ currentOutput: msg.result })
          }
        }
      } catch {
        // Not valid JSON, treat as raw text
        if (mode === 'resume') {
          this.setState((s) => {
            const last = s.resumeMessages[s.resumeMessages.length - 1]
            if (last && last.role === 'assistant') {
              last.content += rawChunk
            } else {
              s.resumeMessages.push({
                role: 'assistant',
                content: rawChunk,
                timestamp: Date.now()
              })
            }
          })
        } else {
          this.setState((s) => {
            s.currentOutput += rawChunk
          })
        }
      }
    }
  }

  killSession(sessionId: string) {
    ipcRenderer.invoke('claude-code:killSession', sessionId)
  }

  clearResumeMessages() {
    this.setState({ resumeMessages: [], resumeOutput: '', resumeError: '' })
  }

  clearOutput() {
    this.setState({ currentOutput: '', error: '' })
  }

  private cleanupStream() {
    if (this.streamHandler) {
      ipcRenderer.removeListener('claude-code:stream', this.streamHandler)
      this.streamHandler = null
    }
  }

  private cleanupResume() {
    if (this.resumeHandler) {
      ipcRenderer.removeListener('claude-code:resume-stream', this.resumeHandler)
      this.resumeHandler = null
    }
  }

  cleanup() {
    this.cleanupStream()
    this.cleanupResume()
  }
}

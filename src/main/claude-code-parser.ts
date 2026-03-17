/**
 * Shared JSONL parsing utilities for Claude Code sessions.
 * Used by both local (claude-code.ts) and remote (ssh-host.ts) session handling.
 */

export function parseJsonlLine(line: string): Record<string, any> | null {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

/**
 * Extract text content from a user message's content field.
 * Handles both string content and array-of-blocks content.
 * Returns empty string for tool_result-only, meta, and command messages.
 */
export function extractUserText(parsed: Record<string, any>): string {
  // Skip meta messages (local-command-caveat, init, etc.)
  if (parsed.isMeta) return ''

  const rawContent = parsed.message?.content
  let msg = ''
  if (typeof rawContent === 'string') {
    msg = rawContent
  } else if (Array.isArray(rawContent)) {
    // Only take 'text' type blocks, skip tool_result/tool_use/image blocks
    const textBlocks = rawContent.filter(
      (b: Record<string, any>) => b.type === 'text' && b.text
    )
    msg = textBlocks
      .map((b: Record<string, any>) => b.text)
      .join(' ')
      .trim()
  }
  if (!msg) return ''
  // Filter out command/meta messages
  if (
    msg.startsWith('[Request interrupted') ||
    msg.startsWith('<command-') ||
    msg.startsWith('<command_name>') ||
    msg.startsWith('<local-command-caveat>') ||
    msg.startsWith('<system-reminder>')
  ) {
    return ''
  }
  return msg
}

/**
 * Extract text content from an assistant message's content field.
 * Handles both string content and array-of-blocks content.
 * Filters out thinking/tool_use blocks, only keeps text blocks.
 */
export function extractAssistantText(parsed: Record<string, any>): string {
  const contentArr = parsed.message?.content
  if (typeof contentArr === 'string') return contentArr
  if (Array.isArray(contentArr)) {
    const textBlocks = contentArr.filter(
      (b: Record<string, any>) => b.type === 'text'
    )
    return textBlocks
      .map((b: Record<string, any>) => b.text || '')
      .join('\n')
      .trim()
  }
  return ''
}

/**
 * Extract the first meaningful user message from JSONL lines (for session title).
 */
export function extractFirstUserMessage(lines: string[], maxLen: number = 100): string {
  for (const line of lines) {
    if (!line.trim()) continue
    const parsed = parseJsonlLine(line)
    if (!parsed || parsed.type !== 'user') continue
    const msg = extractUserText(parsed)
    if (msg) {
      return msg.length > maxLen ? msg.substring(0, maxLen) + '...' : msg
    }
  }
  return ''
}

/**
 * Extract the timestamp from the last JSONL line.
 */
export function extractLastTimestamp(lastLine: string): string {
  if (!lastLine?.trim()) return ''
  const parsed = parseJsonlLine(lastLine)
  return parsed?.timestamp || ''
}

/**
 * Parse all user/assistant messages from JSONL lines.
 * Returns a flat array of messages suitable for display.
 */
export function parseSessionMessages(
  lines: string[],
  offset: number = 0,
  limit: number = 100
): Array<{
  uuid: string
  type: string
  content: string
  timestamp: string
  model?: string
  tokens?: { input: number; output: number }
}> {
  const messages: Array<{
    uuid: string
    type: string
    content: string
    timestamp: string
    model?: string
    tokens?: { input: number; output: number }
  }> = []

  for (const line of lines) {
    const parsed = parseJsonlLine(line)
    if (!parsed) continue

    if (parsed.type === 'user') {
      const text = extractUserText(parsed)
      if (text) {
        messages.push({
          uuid: parsed.uuid || '',
          type: 'user',
          content: text,
          timestamp: parsed.timestamp || ''
        })
      }
    } else if (parsed.type === 'assistant') {
      const text = extractAssistantText(parsed)
      if (text) {
        const entry: {
          uuid: string
          type: string
          content: string
          timestamp: string
          model?: string
          tokens?: { input: number; output: number }
        } = {
          uuid: parsed.uuid || '',
          type: 'assistant',
          content: text,
          timestamp: parsed.timestamp || ''
        }
        if (parsed.message?.model) {
          entry.model = parsed.message.model
        }
        if (parsed.message?.usage) {
          entry.tokens = {
            input: parsed.message.usage.input_tokens || 0,
            output: parsed.message.usage.output_tokens || 0
          }
        }
        messages.push(entry)
      }
    }
  }

  return messages.slice(offset, offset + limit)
}

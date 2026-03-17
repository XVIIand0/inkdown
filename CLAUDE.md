# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Inkdown is a WYSIWYG markdown editor and LLM dialogue tool built as an Electron desktop app with React. It supports GitHub Flavored Markdown and integrates multiple LLM providers (OpenAI, Claude, Gemini, OpenRouter, Ollama, LM Studio, DeepSeek, Qwen).

**Status:** Active development — being extended into a Claude Code Command Center with SSH remote host support.

## Common Commands

- **Dev server:** `npm run dev` (electron-vite dev with hot-reload)
- **Typecheck:** `npm run typecheck` (runs both node and web checks)
- **Build:** `npm run build` (typecheck + electron-vite build)
- **Format:** `npm run format` (prettier)
- **Package (example):** `npm run build:win:x64`, `npm run build:mac:arm64`, `npm run build:linux`
- **Build parser bundle:** `npm run build:parser`
- **Post-install:** runs automatically — rebuilds native modules (better-sqlite3)

There is no test framework or test suite configured.

## Architecture

### Electron Three-Process Model

- **Main process** (`src/main/`): Window management, IPC handlers, SQLite database (via knex), LanceDB vector DB, file system operations, auto-update.
- **Preload** (`src/preload/`): Context-isolated bridge exposing safe APIs (fs, clipboard, IPC) to the renderer.
- **Renderer** (`src/renderer/src/`): React UI — the bulk of the application.

### Renderer Architecture

**State management:** MobX stores in `src/renderer/src/store/`. Root `Store` class aggregates sub-stores (`ChatStore`, `NoteStore`, `SettingsStore`, `KeyboardStore`, `LLMClient`). Components use `observer()` from `mobx-react-lite`.

**Editor:** Built on Slate (`src/renderer/src/editor/`). Custom element renderers in `elements/`, plugins in `plugins/` (keyboard, highlighting, change handling). Markdown ↔ Slate AST conversion handled by the parser module (`editor/parser/`). A Web Worker handles heavy parsing.

**LLM integration:** Unified `AiClient` in `store/llm/client.ts` with provider implementations in `store/llm/provider/` (OpenAI, Claude, Gemini, etc.). Each provider extends a common interface from `struct.ts`.

**Document I/O:**
- Import: `src/renderer/src/parser/` — DOCX, PDF, Excel → Markdown
- Export: `src/renderer/src/output/` — Markdown → HTML, PDF, DOCX

**Vector search:** LanceDB + Jina embeddings (via `@xenova/transformers`) for semantic search over notes. Configured in `src/main/database/api.ts`.

### Path Aliases (Vite)

- `@/` and `@renderer/` both resolve to `src/renderer/src/`

## Code Style

- Prettier: single quotes, no semicolons, 100 char width, no trailing commas
- TypeScript with two tsconfig targets: `tsconfig.node.json` (main/preload) and `tsconfig.web.json` (renderer with React JSX)
- Package manager: pnpm

## Claude Code Command Center

Inkdown has been extended with a "Claude Code mode" that acts as a command center for managing Claude Code sessions across local and remote (SSH) hosts.

### Key Components

- **`src/main/claude-code-cli.ts`**: Local Claude Code CLI integration — spawns `claude` via node-pty for interactive terminal sessions, handles `--resume` for session continuation
- **`src/main/ssh-host.ts`**: SSH host management — CRUD, connection testing, remote project/session scanning via SSH, remote Claude terminal spawning (`ssh -t ... claude --resume`)
- **`src/renderer/src/store/claude-code.ts`**: MobX store for projects/sessions, supports both local and remote (hostId-based routing)
- **`src/renderer/src/store/ssh-host.ts`**: MobX store for SSH hosts, import dialog, resync
- **`src/renderer/src/ui/claude-code/Sidebar.tsx`**: Sidebar with grouped Local/SSH host sections, project/session tree
- **`src/renderer/src/ui/claude-code/SessionView.tsx`**: Session viewer with Live (xterm.js terminal) and History (parsed JSONL) modes
- **`src/renderer/src/ui/claude-code/SshHostDialog.tsx`**: SSH host add/edit dialog
- **`src/renderer/src/ui/claude-code/RemoteImportDialog.tsx`**: Remote project import dialog

### SSH Remote Architecture

- Remote session data is read via `ssh ... cat/head/tail | base64` to safely transfer JSONL content
- Remote JSONL parsing extracts user/assistant messages, filters out `<command-` init messages and `[Request interrupted` markers
- Live mode for remote sessions uses `ssh -t user@host -- claude --resume <sessionId>` via node-pty
- SSH terminal processes are registered in a shared `terminalProcesses` map so the same input/resize IPC handlers work for both local and remote
- Settings store `claudeCodeImportedProjects` uses `Record<string, string[]>` format: `{ local: [...], 'ssh-host-id': [...] }`

### Database Tables

- `ssh_host`: SSH host configurations (hostname, port, username, auth method, icon customization)
- Standard knex migrations in `src/main/database/`

### i18n

Three locales: `en_US.json`, `zh_CN.json`, `zh_TW.json` — SSH host keys are under `sshHost.*`

### Development Notes

- Don't build after every change during active development — build only at the end
- `node-pty` requires native module rebuild; on Windows, SSH path must be resolved to full path (`C:\Windows\System32\OpenSSH\ssh.exe`)
- When sending data through SSH, use base64 encoding to avoid shell escaping and encoding issues (especially with CJK content and cp950 on Windows)

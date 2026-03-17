# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Inkdown is a WYSIWYG markdown editor and LLM dialogue tool built as an Electron desktop app with React. It supports GitHub Flavored Markdown and integrates multiple LLM providers (OpenAI, Claude, Gemini, OpenRouter, Ollama, LM Studio, DeepSeek, Qwen).

**Status:** Development is paused / not actively maintained.

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

import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useCallback } from 'react'
import Editor, { type OnMount, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { useStore } from '@/store/store'
import { defaultEditorOptions } from './MonacoConfig'
import type { editor as monacoEditor } from 'monaco-editor'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

loader.config({ monaco })

function getTheme(): string {
  return document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs'
}

export const CodeFileEditor = observer(({ filePath }: { filePath: string }) => {
  const store = useStore()
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    store.codeFile.loadFile(filePath)
  }, [filePath, store])

  const fileEntry = store.codeFile.getFileContent(filePath)

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        store.codeFile.updateContent(filePath, value)
      }
    },
    [filePath, store]
  )

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      editor.addAction({
        id: 'save-file',
        label: 'Save File',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => {
          store.codeFile.saveFile(filePath)
        }
      })
    },
    [filePath, store]
  )

  const fileName = filePath.split(/[/\\]/).pop() || filePath

  if (!fileEntry) {
    return (
      <div className={'flex items-center justify-center h-full text-secondary'}>
        Loading...
      </div>
    )
  }

  return (
    <div className={'flex flex-col w-full h-full'}>
      <div
        className={
          'flex items-center h-8 px-3 text-xs shrink-0 ' +
          'border-b border-theme ' +
          'text-secondary'
        }
        style={{ background: 'var(--tab)' }}
      >
        <span className={'truncate'} title={filePath}>
          {fileName}
        </span>
        {fileEntry.dirty && (
          <span className={'ml-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0'} />
        )}
      </div>
      <div className={'flex-1 min-h-0'}>
        <Editor
          theme={getTheme()}
          language={fileEntry.language}
          value={fileEntry.content}
          onChange={handleChange}
          onMount={handleEditorMount}
          options={defaultEditorOptions}
        />
      </div>
    </div>
  )
})

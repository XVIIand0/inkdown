import { observer } from 'mobx-react-lite'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/store'
import { Save } from 'lucide-react'
import { createEditor, Descendant, Editor, Node } from 'slate'
import { Editable, RenderElementProps, RenderLeafProps, Slate, withReact } from 'slate-react'
import { withHistory } from 'slate-history'
import { EditorUtils } from '@/editor/utils/editorUtils'
import { useHighlight } from '@/editor/plugins/useHighlight'
import { InlineChromiumBugfix } from '@/editor/utils/InlineChromiumBugfix'
import { CustomLeaf } from '@/editor'
import { slugify } from '@/editor/utils/dom'

const inlineNode = new Set(['inline-katex', 'break', 'wiki-link'])
const voidNode = new Set(['hr', 'break'])

const createMindNoteEditor = () => {
  const editor = withHistory(withReact(createEditor()))
  const { isInline, isVoid } = editor
  editor.isInline = (element) => inlineNode.has(element.type) || isInline(element)
  editor.isVoid = (element) => voidNode.has(element.type) || isVoid(element)
  return editor
}

function SimpleElement(props: RenderElementProps) {
  const { element, attributes, children } = props
  switch (element.type) {
    case 'head':
      return React.createElement(
        `h${element.level}`,
        { ...attributes, ['data-head']: slugify(Node.string(element) || '') },
        children
      )
    case 'blockquote':
      return (
        <blockquote data-be={'blockquote'} {...attributes}>
          {children}
        </blockquote>
      )
    case 'list': {
      const tag = element.order ? 'ol' : 'ul'
      return (
        <div data-be={'list'} {...attributes}>
          {React.createElement(
            tag,
            {
              className: 'm-list',
              start: element.start,
              ['data-task']: element.task ? 'true' : undefined
            },
            children
          )}
        </div>
      )
    }
    case 'list-item': {
      const isTask = typeof element.checked === 'boolean'
      return (
        <li
          className={`m-list-item ${isTask ? 'task' : ''}`}
          data-be={'list-item'}
          {...attributes}
        >
          {isTask && (
            <span contentEditable={false} className={'check-item'}>
              <input type={'checkbox'} checked={element.checked} readOnly />
            </span>
          )}
          {children}
        </li>
      )
    }
    case 'code': {
      const code = element.code || ''
      const lang = element.language || ''
      return (
        <div {...attributes} data-be={'code'}>
          <div contentEditable={false} className={'code-highlight'}>
            {lang && <span className={'code-lang-label'}>{lang}</span>}
            <pre className={'whitespace-pre-wrap'}>
              <code>{code}</code>
            </pre>
          </div>
          <div style={{ display: 'none' }}>{children}</div>
        </div>
      )
    }
    case 'table':
      return (
        <div {...attributes} data-be={'table'}>
          <table>
            <tbody>{children}</tbody>
          </table>
        </div>
      )
    case 'table-row':
      return <tr {...attributes}>{children}</tr>
    case 'table-cell':
      return element.title ? (
        <th
          {...attributes}
          style={{
            textAlign: element.align,
            minWidth: element.width || 140,
            maxWidth: element.width || 140
          }}
        >
          <div>{children}</div>
        </th>
      ) : (
        <td
          {...attributes}
          style={{
            textAlign: element.align,
            minWidth: element.width || 140,
            maxWidth: element.width || 140
          }}
        >
          {children}
        </td>
      )
    case 'hr':
      return (
        <div {...attributes} contentEditable={false} className={'m-hr select-none'}>
          {children}
        </div>
      )
    case 'break':
      return (
        <span {...attributes} contentEditable={false}>
          {children}
          <br />
        </span>
      )
    case 'media': {
      const url = element.url || ''
      return (
        <div {...attributes} contentEditable={false} className={'my-2'}>
          {url && <img src={url} alt={''} style={{ maxWidth: '100%' }} />}
          <div style={{ display: 'none' }}>{children}</div>
        </div>
      )
    }
    case 'inline-katex': {
      const katexStr = Node.string(element)
      return (
        <span {...attributes} className={'inline-code'}>
          <InlineChromiumBugfix />
          {children}
          <InlineChromiumBugfix />
        </span>
      )
    }
    case 'wiki-link': {
      return (
        <span {...attributes} className={'link mx-[1px] inline-block'}>
          <InlineChromiumBugfix />
          {children}
          <InlineChromiumBugfix />
        </span>
      )
    }
    default:
      return <p {...attributes}>{children}</p>
  }
}

function SimpleLeaf(props: RenderLeafProps) {
  const leaf = props.leaf as CustomLeaf
  let children = <>{props.children}</>
  const style: React.CSSProperties = {}
  let className = ''
  if (leaf.code) children = <code className={'inline-code'}>{children}</code>
  if (leaf.highColor) style.color = leaf.highColor
  if (leaf.color) style.color = leaf.color
  if (leaf.bold) children = <strong>{children}</strong>
  if (leaf.strikethrough) children = <s>{children}</s>
  if (leaf.italic) children = <i>{children}</i>
  if (leaf.html) className += ' dark:text-gray-500 text-gray-400'
  const dirty = leaf.bold || leaf.code || leaf.italic || leaf.strikethrough || leaf.highColor
  if (leaf.url || leaf.link) {
    return (
      <span
        style={style}
        className={`mx-[1px] inline-block link cursor-default ${className}`}
        {...props.attributes}
      >
        {!!props.text?.text && <InlineChromiumBugfix />}
        {children}
        {!!props.text?.text && <InlineChromiumBugfix />}
      </span>
    )
  }
  return (
    <span
      {...props.attributes}
      className={`${!!dirty ? 'mx-[1px]' : ''} ${className}`}
      style={style}
    >
      {!!dirty && !!leaf.text && <InlineChromiumBugfix />}
      {children}
      {!!dirty && !!leaf.text && <InlineChromiumBugfix />}
    </span>
  )
}

const defaultValue: Descendant[] = [EditorUtils.p]

// In-memory cache: survives unmount/remount, prevents race between async DB save and load
const editorCache = new Map<string, { title: string; children: Descendant[] }>()

export const MindNoteEditor = observer(({ noteId }: { noteId: string }) => {
  const store = useStore()

  // Check cache synchronously during render — must happen BEFORE <Slate> mounts,
  // because <Slate> does `editor.children = initialValue` on first mount and
  // would overwrite any effect-based restoration.
  const cachedData = useMemo(() => {
    const cached = editorCache.get(noteId)
    if (cached) {
      editorCache.delete(noteId)
      return cached
    }
    return null
  }, [noteId])

  const [title, setTitle] = useState(cachedData?.title || '')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(!!cachedData)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleRef = useRef(title)
  const editorRef = useRef<Editor | null>(null)
  const firstRef = useRef(true)
  const noteIdRef = useRef(noteId)
  noteIdRef.current = noteId

  if (!editorRef.current) {
    editorRef.current = createMindNoteEditor()
  }
  const editor = editorRef.current

  // The initial value for <Slate>: use cache if available, otherwise default empty
  const slateInitialValue = useMemo(() => {
    return cachedData?.children || defaultValue
  }, [cachedData])

  titleRef.current = title

  const high = useHighlight()

  const getMarkdownFromEditor = useCallback(async (): Promise<string> => {
    const schema = editor.children
    if (
      schema.length === 1 &&
      schema[0].type === 'paragraph' &&
      !Node.string(schema[0])
    ) {
      return ''
    }
    try {
      const result = await store.worker.toMarkdown({
        schema,
        doc: {
          id: noteId,
          name: 'mind-note',
          folder: false,
          parentId: 'root',
          updated: Date.now()
        }
      })
      return result.md
    } catch (e) {
      console.error('Failed to convert to markdown', e)
      return ''
    }
  }, [editor, noteId, store.worker])

  const doSave = useCallback(async () => {
    setSaving(true)
    try {
      const md = await getMarkdownFromEditor()
      await store.mindNote.saveNote(noteId, {
        title: titleRef.current,
        content: md
      })
    } finally {
      setSaving(false)
    }
  }, [noteId, store.mindNote, getMarkdownFromEditor])

  // Sync editor state to in-memory cache on every content change.
  // This cache survives unmount and is read synchronously on next mount
  // so <Slate initialValue={...}> gets the right data.
  const syncCache = useCallback(() => {
    editorCache.set(noteIdRef.current, {
      title: titleRef.current,
      children: JSON.parse(JSON.stringify(editor.children))
    })
  }, [editor])

  const scheduleSave = useCallback(() => {
    syncCache()
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      doSave()
    }, 800)
  }, [doSave, syncCache])

  const doSaveRef = useRef(doSave)
  doSaveRef.current = doSave
  const syncCacheRef = useRef(syncCache)
  syncCacheRef.current = syncCache

  // On unmount: sync cache (synchronous) then fire async DB save
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      syncCacheRef.current()
      doSaveRef.current()
    }
  }, [])

  // Load from DB (only when no cached data was available)
  useEffect(() => {
    if (cachedData) {
      // Already restored from cache — just enable editing
      firstRef.current = true
      setTimeout(() => {
        firstRef.current = false
      }, 100)
      return
    }

    let cancelled = false
    setLoaded(false)
    firstRef.current = true

    store.mindNote.getNote(noteId).then(async (note) => {
      if (cancelled || !note) return
      setTitle(note.title || '')
      if (note.content) {
        try {
          const schema = await store.worker.parseMarkdown(note.content)
          if (!cancelled) {
            editor.selection = null
            EditorUtils.reset(editor, schema.length ? schema : undefined, true)
          }
        } catch (e) {
          console.error('Failed to parse markdown', e)
          if (!cancelled) {
            EditorUtils.reset(editor, undefined, true)
          }
        }
      } else {
        if (!cancelled) {
          EditorUtils.reset(editor, undefined, true)
        }
      }
      if (!cancelled) {
        setLoaded(true)
        setTimeout(() => {
          firstRef.current = false
        }, 100)
      }
    })
    return () => {
      cancelled = true
    }
  }, [noteId, store.mindNote, editor, store.worker, cachedData])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current)
        }
        doSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [doSave])

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value)
      titleRef.current = e.target.value
      scheduleSave()
    },
    [scheduleSave]
  )

  const handleTitleBlur = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    doSave()
  }, [doSave])

  const onChange = useCallback(
    (v: Descendant[]) => {
      if (firstRef.current) return
      if (!editor.operations?.every((o) => o.type === 'set_selection')) {
        scheduleSave()
      }
    },
    [editor, scheduleSave]
  )

  const onBlur = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    doSave()
  }, [doSave])

  const renderElement = useCallback(
    (props: RenderElementProps) => <SimpleElement {...props} />,
    []
  )

  const renderLeaf = useCallback(
    (props: RenderLeafProps) => <SimpleLeaf {...props} />,
    []
  )

  if (!loaded) {
    return (
      <div className={'flex items-center justify-center h-full text-secondary'}>
        Loading...
      </div>
    )
  }

  return (
    <div className={'flex flex-col h-full primary-bg-color'}>
      <div
        className={
          'flex items-center gap-2 px-4 py-2 border-b border-theme shrink-0'
        }
      >
        <input
          type={'text'}
          value={title}
          onChange={handleTitleChange}
          onBlur={handleTitleBlur}
          placeholder={'Untitled note'}
          className={
            'flex-1 bg-transparent text-base font-medium outline-none ' +
            'md-text placeholder-gray-400 dark:placeholder-gray-500'
          }
        />
        {saving && <Save className={'w-4 h-4 text-secondary animate-pulse'} />}
      </div>
      <div className={'flex-1 overflow-y-auto'}>
        <div className={'max-w-[796px] mx-auto px-8 py-4'}>
          <Slate editor={editor} initialValue={slateInitialValue} onChange={onChange}>
            <Editable
              decorate={high}
              spellCheck={false}
              className={'edit-area outline-none md-text text-sm leading-relaxed'}
              renderElement={renderElement}
              renderLeaf={renderLeaf}
              onBlur={onBlur}
              placeholder={'Write your notes in markdown...'}
            />
          </Slate>
        </div>
      </div>
    </div>
  )
})

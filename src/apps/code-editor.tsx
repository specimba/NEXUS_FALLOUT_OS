'use client'

// ============================================================
// NEXUS OS — Code Editor App
//
// Features:
//   • Left sidebar: recursive VFS file tree (load / delete inline)
//   • Editor: textarea + line-number gutter (synced scroll, Tab=2 sp)
//   • Top bar: language selector + filename + New/Save/Run buttons
//   • Bottom: console panel (color-coded output from web worker)
//   • Real JS execution via web worker (new Function)
//   • TypeScript runs as JS (best-effort) — Python shows Pyodide stub
//   • Language auto-detects from extension
//   • Opens files via launch-params (file-manager double-click)
//
// PERFORMANCE:
//   • TreeNode + Gutter + ConsoleRow are React.memo'd
//   • All handlers useCallback'd so memo'd children skip re-render
//   • Gutter only re-renders when lineCount changes
//   • Gutter scroll synced via ref (no React state per scroll event)
//   • Typing only re-renders the textarea (+ parent); memo'd children
//     bail out via shallow prop comparison
// ============================================================

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Code2,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  File as FileIcon,
  Play,
  Save,
  FilePlus2,
  Trash2,
  Eraser,
  Loader2,
} from 'lucide-react'
import { useFsStore } from '@/stores/fs-store'
import { pathOf } from '@/lib/os/vfs'
import type { FSNode, WindowComponentProps } from '@/lib/os/types'
import {
  useLaunchParams,
  clearLaunchParams,
} from '@/lib/os/launch-params'
import { registerApp } from './registry'

// ----- types ---------------------------------------------------------

type Lang = 'javascript' | 'typescript' | 'python'

type ConsoleLine = {
  id: number
  level: 'log' | 'info' | 'warn' | 'error' | 'system'
  text: string
}

// ----- helpers -------------------------------------------------------

function detectLanguage(filename: string): Lang {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.py')) return 'python'
  return 'javascript'
}

function fileIcon(name: string): ReactNode {
  const lower = name.toLowerCase()
  if (lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.py'))
    return <FileCode className="h-3.5 w-3.5" />
  if (lower.endsWith('.json')) return <FileJson className="h-3.5 w-3.5" />
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return <FileText className="h-3.5 w-3.5" />
  return <FileIcon className="h-3.5 w-3.5" />
}

const PHOSPHOR = 'var(--phosphor)'
const PHOSPHOR_BRIGHT = 'var(--phosphor-bright)'
const PHOSPHOR_DIM = 'var(--phosphor-dim)'
const BG_DEEP = 'var(--bg-deep)'
const BORDER = 'var(--border)'
const CARD = 'var(--card)'
const CYAN = 'var(--cyber-cyan)'
const AMBER = 'var(--pip-amber)'
const MAGENTA = 'var(--cyber-magenta)'

// ============================================================
// TreeNode — recursive file-tree node (React.memo'd)
// ============================================================

type TreeNodeProps = {
  node: FSNode
  path: string
  depth: number
  isExpanded: boolean
  isCurrent: boolean
  isDirty: boolean
  expandedSet: Set<string>
  onToggle: (id: string) => void
  onSelect: (path: string) => void
  onDelete: (path: string, isDir: boolean) => void
}

const TreeNode = memo(function TreeNode({
  node,
  path,
  depth,
  isExpanded,
  isCurrent,
  isDirty,
  expandedSet,
  onToggle,
  onSelect,
  onDelete,
}: TreeNodeProps) {
  const vfs = useFsStore((s) => s.vfs)

  const handleRowClick = useCallback(() => {
    if (node.type === 'dir') {
      onToggle(node.id)
    } else {
      onSelect(path)
    }
  }, [node.id, node.type, path, onToggle, onSelect])

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDelete(path, node.type === 'dir')
    },
    [path, node.type, onDelete]
  )

  const pad = 8 + depth * 12

  if (node.type === 'dir') {
    return (
      <div>
        <div
          role="treeitem"
          aria-expanded={isExpanded}
          aria-selected={isCurrent}
          tabIndex={0}
          onClick={handleRowClick}
          className="group flex cursor-pointer items-center gap-1 py-0.5 pr-1 text-[11px] select-none hover:bg-[var(--accent)]"
          style={{ paddingLeft: pad, color: CYAN }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{node.name === '/' ? '/' : node.name}</span>
        </div>
        {isExpanded && (
          <div role="group">
            {Object.values(vfs)
              .filter((c) => c.parentId === node.id)
              .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
                return a.name.localeCompare(b.name)
              })
              .map((c) => (
                <TreeNode
                  key={c.id}
                  node={c}
                  path={path === '/' ? `/${c.name}` : `${path}/${c.name}`}
                  depth={depth + 1}
                  isExpanded={expandedSet.has(c.id)}
                  isCurrent={false}
                  isDirty={false}
                  expandedSet={expandedSet}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              ))}
          </div>
        )}
      </div>
    )
  }

  // file
  return (
    <div
      role="treeitem"
      aria-selected={isCurrent}
      tabIndex={0}
      onClick={handleRowClick}
      className="group flex cursor-pointer items-center gap-1 py-0.5 pr-1 text-[11px] select-none hover:bg-[var(--accent)]"
      style={{
        paddingLeft: pad,
        color: isCurrent ? PHOSPHOR_BRIGHT : PHOSPHOR,
        background: isCurrent ? 'var(--phosphor-deep)' : 'transparent',
      }}
    >
      <span className="w-3 shrink-0" aria-hidden />
      {fileIcon(node.name)}
      <span className="truncate">
        {node.name}
        {isCurrent && isDirty && (
          <span style={{ color: AMBER }}>*</span>
        )}
      </span>
      <button
        type="button"
        onClick={handleDelete}
        aria-label={`Delete ${node.name}`}
        className="ml-auto hidden shrink-0 items-center justify-center border px-1 group-hover:flex"
        style={{
          borderColor: BORDER,
          color: MAGENTA,
        }}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
})

// ============================================================
// Gutter — line numbers (React.memo'd, only re-renders on lineCount)
// ============================================================

type GutterProps = {
  lineCount: number
  gutterRef: React.RefObject<HTMLDivElement | null>
}

const Gutter = memo(function Gutter({ lineCount, gutterRef }: GutterProps) {
  // Build line numbers 1..lineCount. Use useMemo so the array is
  // stable across re-renders with the same lineCount.
  const lines = useMemo(() => {
    const arr: number[] = []
    for (let i = 1; i <= lineCount; i++) arr.push(i)
    return arr
  }, [lineCount])

  return (
    <div
      ref={gutterRef}
      aria-hidden
      className="shrink-0 select-none overflow-hidden text-right font-mono text-[11px] leading-[1.4]"
      style={{
        width: 44,
        minWidth: 44,
        padding: '6px 6px 6px 0',
        color: PHOSPHOR_DIM,
        background: BG_DEEP,
        borderRight: `1px solid ${BORDER}`,
      }}
    >
      {lines.map((n) => (
        <div key={n}>{n}</div>
      ))}
    </div>
  )
})

// ============================================================
// ConsoleRow — single console line (React.memo'd)
// ============================================================

type ConsoleRowProps = {
  line: ConsoleLine
}

const ConsoleRow = memo(function ConsoleRow({ line }: ConsoleRowProps) {
  const color =
    line.level === 'error'
      ? MAGENTA
      : line.level === 'warn'
        ? AMBER
        : line.level === 'info'
          ? CYAN
          : line.level === 'system'
            ? PHOSPHOR_DIM
            : PHOSPHOR
  const prefix =
    line.level === 'error'
      ? '✖ '
      : line.level === 'warn'
        ? '⚠ '
        : line.level === 'system'
          ? '» '
          : ''
  return (
    <div
      className="whitespace-pre-wrap break-all px-2 py-0.5 font-mono text-[11px] leading-[1.4]"
      style={{ color }}
    >
      {prefix}
      {line.text}
    </div>
  )
})

// ============================================================
// Main app component
// ============================================================

export function CodeEditorApp({ windowId }: WindowComponentProps) {
  const vfs = useFsStore((s) => s.vfs)
  const fsVersion = useFsStore((s) => s.version)
  const writeFile = useFsStore((s) => s.writeFile)
  const createFile = useFsStore((s) => s.createFile)
  const remove = useFsStore((s) => s.remove)

  // ---- editor state ----
  const [filePath, setFilePath] = useState<string | null>(null)
  const [savedContent, setSavedContent] = useState('')
  const [content, setContent] = useState('')
  const [language, setLanguage] = useState<Lang>('javascript')
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['root', 'home', 'nexus'])
  )
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([])
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)

  // ---- refs ----
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const gutterRef = useRef<HTMLDivElement | null>(null)
  const consoleRef = useRef<HTMLDivElement | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const lineIdRef = useRef(0)
  const dirtyRef = useRef(false)

  // ---- derived ----
  const lineCount = useMemo(
    () => (content ? content.split('\n').length : 1),
    [content]
  )
  const dirty = content !== savedContent

  // Mirror `dirty` into a ref so the launch-params effect (which reads
  // it to decide whether to confirm discard) doesn't need `dirty` as
  // a dep (which would re-run the effect on every keystroke).
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  // ---- launch params ----
  const params = useLaunchParams(windowId)

  const loadFile = useCallback(
    (path: string) => {
      const node = Object.values(vfs).find((n) => pathOf(vfs, n.id) === path)
      if (!node || node.type !== 'file') {
        setConsoleLines((prev) => [
          ...prev,
          {
            id: ++lineIdRef.current,
            level: 'error',
            text: `no such file: ${path}`,
          },
        ])
        return
      }
      const next = node.content ?? ''
      setFilePath(path)
      setSavedContent(next)
      setContent(next)
      setLanguage(detectLanguage(node.name))
    },
    [vfs]
  )

  // Auto-load file from launch-params (file-manager double-click).
  // Clears params after consuming so re-opening the same file later
  // (even with the same path) re-triggers the effect.
  useEffect(() => {
    const fp = params.filePath
    if (typeof fp !== 'string' || !fp) return
    // If switching away from a dirty buffer, confirm.
    if (dirtyRef.current && fp !== filePath) {
      if (!window.confirm(`Discard unsaved changes to ${filePath ?? 'untitled'}?`)) {
        clearLaunchParams(windowId)
        return
      }
    }
    loadFile(fp)
    clearLaunchParams(windowId)
  }, [params.filePath, loadFile, windowId, filePath])

  // ---- handlers (all useCallback'd for memo'd children) ----

  const handleSelect = useCallback(
    (path: string) => {
      if (dirtyRef.current && path !== filePath) {
        if (!window.confirm(`Discard unsaved changes to ${filePath ?? 'untitled'}?`))
          return
      }
      loadFile(path)
    },
    [loadFile, filePath]
  )

  const handleToggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleDelete = useCallback(
    (path: string, isDir: boolean) => {
      const label = isDir ? 'directory and all contents' : 'file'
      if (!window.confirm(`Delete ${label}? ${path}`)) return
      const r = remove(path)
      if (!r.ok) {
        setConsoleLines((prev) => [
          ...prev,
          {
            id: ++lineIdRef.current,
            level: 'error',
            text: `delete failed: ${r.error}`,
          },
        ])
        return
      }
      if (filePath === path) {
        setFilePath(null)
        setSavedContent('')
        setContent('')
      }
    },
    [remove, filePath]
  )

  const handleNew = useCallback(() => {
    const input = window.prompt('New file path (e.g. /home/nexus/projects/new.js):')
    if (!input) return
    if (dirtyRef.current) {
      if (!window.confirm(`Discard unsaved changes to ${filePath ?? 'untitled'}?`))
        return
    }
    const r = createFile(input, '')
    if (!r.ok) {
      setConsoleLines((prev) => [
        ...prev,
        {
          id: ++lineIdRef.current,
          level: 'error',
          text: `create failed: ${r.error}`,
        },
      ])
      return
    }
    loadFile(r.path)
  }, [createFile, filePath, loadFile])

  const handleSave = useCallback(() => {
    if (!filePath) {
      const input = window.prompt('Save as (path):')
      if (!input) return
      const r = writeFile(input, content)
      if (!r.ok) {
        setConsoleLines((prev) => [
          ...prev,
          {
            id: ++lineIdRef.current,
            level: 'error',
            text: `save failed: ${r.error}`,
          },
        ])
        return
      }
      setFilePath(r.path)
      setSavedContent(content)
      setLanguage(detectLanguage(r.path.split('/').pop() ?? ''))
      return
    }
    const r = writeFile(filePath, content)
    if (!r.ok) {
      setConsoleLines((prev) => [
        ...prev,
        {
          id: ++lineIdRef.current,
          level: 'error',
          text: `save failed: ${r.error}`,
        },
      ])
      return
    }
    setSavedContent(content)
  }, [filePath, content, writeFile])

  const handleClear = useCallback(() => {
    setConsoleLines([])
  }, [])

  // ---- editor textarea handlers ----

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value)
    },
    []
  )

  const handleScroll = useCallback(() => {
    if (taRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = taRef.current.scrollTop
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        const ta = e.currentTarget
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const indent = '  '
        const next = content.slice(0, start) + indent + content.slice(end)
        setContent(next)
        // Restore cursor after React commits the new value.
        requestAnimationFrame(() => {
          if (taRef.current) {
            taRef.current.selectionStart = taRef.current.selectionEnd =
              start + indent.length
          }
        })
      }
      // Ctrl/Cmd+S → save
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
      }
    },
    [content, handleSave]
  )

  // ---- run via worker ----

  const pushLine = useCallback((level: ConsoleLine['level'], text: string) => {
    setConsoleLines((prev) => [
      ...prev,
      { id: ++lineIdRef.current, level, text },
    ])
  }, [])

  const handleRun = useCallback(() => {
    if (running) return
    if (language === 'python') {
      pushLine('system', 'Python execution requires Pyodide (not loaded).')
      pushLine('system', 'Save the file and run it in an external Python interpreter.')
      return
    }
    if (!content.trim()) {
      pushLine('system', 'Nothing to run — file is empty.')
      return
    }

    // Tear down any prior worker (defensive).
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }

    setRunning(true)
    pushLine('system', `▶ running ${language}…`)

    let worker: Worker
    try {
      worker = new Worker(
        new URL('../components/os/code-editor/worker.ts', import.meta.url)
      )
    } catch (err) {
      setRunning(false)
      pushLine(
        'error',
        `failed to spawn worker: ${err instanceof Error ? err.message : String(err)}`
      )
      return
    }
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      if (!msg || typeof msg !== 'object') return
      const m = msg as { type: string; line?: string; level?: string; message?: string }
      if (m.type === 'output' && typeof m.line === 'string') {
        const level = (m.level as ConsoleLine['level']) ?? 'log'
        pushLine(level, m.line)
      } else if (m.type === 'error' && typeof m.message === 'string') {
        pushLine('error', m.message)
      } else if (m.type === 'done') {
        setRunning(false)
        worker.terminate()
        if (workerRef.current === worker) workerRef.current = null
      }
    }
    worker.onerror = (e: ErrorEvent) => {
      pushLine('error', `worker error: ${e.message || 'unknown'}`)
      setRunning(false)
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
    }

    worker.postMessage({ code: content })
  }, [running, language, content, pushLine])

  // ---- auto-scroll console to bottom on new output ----
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [consoleLines])

  // ---- terminate worker on unmount ----
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [])

  // ---- render ----

  const filename = filePath ? filePath.split('/').pop() ?? filePath : 'untitled'

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ background: BG_DEEP, color: PHOSPHOR, fontFamily: 'var(--font-mono), ui-monospace, monospace' }}
    >
      {/* ===== Top bar ===== */}
      <div
        className="flex shrink-0 items-center gap-2 border-b px-2 py-1"
        style={{ borderColor: BORDER, background: CARD }}
      >
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as Lang)}
          className="border px-1 py-0.5 text-[10px] uppercase tracking-wider outline-none"
          style={{
            borderColor: BORDER,
            background: BG_DEEP,
            color: PHOSPHOR_BRIGHT,
          }}
          aria-label="Language"
        >
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python (stub)</option>
        </select>

        <div
          className="flex min-w-0 items-center gap-1 text-[11px]"
          style={{ color: PHOSPHOR_BRIGHT }}
        >
          <Code2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{filename}</span>
          {dirty && <span style={{ color: AMBER }}>*</span>}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={handleNew}
            className="flex items-center gap-1 border px-2 py-0.5 text-[10px] uppercase tracking-wider transition hover:opacity-100"
            style={{ borderColor: BORDER, color: PHOSPHOR, opacity: 0.85 }}
            title="New file"
          >
            <FilePlus2 className="h-3 w-3" />
            <span className="hidden sm:inline">New</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1 border px-2 py-0.5 text-[10px] uppercase tracking-wider transition hover:opacity-100"
            style={{ borderColor: BORDER, color: PHOSPHOR, opacity: 0.85 }}
            title="Save (Ctrl+S)"
          >
            <Save className="h-3 w-3" />
            <span className="hidden sm:inline">Save</span>
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1 border px-2 py-0.5 text-[10px] uppercase tracking-wider transition hover:opacity-100 disabled:opacity-40"
            style={{ borderColor: BORDER, color: PHOSPHOR_BRIGHT }}
            title="Run"
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            <span className="hidden sm:inline">Run</span>
          </button>
        </div>
      </div>

      {/* ===== Body: tree + editor ===== */}
      <div className="flex min-h-0 flex-1">
        {/* File tree */}
        <aside
          className="hidden w-44 shrink-0 flex-col overflow-y-auto border-r sm:flex md:w-52"
          style={{ borderColor: BORDER, background: CARD }}
          aria-label="Files"
        >
          <div
            className="shrink-0 border-b px-2 py-1 text-[9px] uppercase tracking-[0.2em]"
            style={{ borderColor: BORDER, color: PHOSPHOR_DIM }}
          >
            VFS
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1" style={{ maxHeight: '100%' }}>
            {/* root */}
            <TreeNode
              key="root"
              node={vfs['root']}
              path="/"
              depth={0}
              isExpanded={expanded.has('root')}
              isCurrent={false}
              isDirty={false}
              expandedSet={expanded}
              onToggle={handleToggle}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />
          </div>
          <div
            className="shrink-0 border-t px-2 py-1 text-[9px] uppercase tracking-widest"
            style={{ borderColor: BORDER, color: PHOSPHOR_DIM }}
          >
            v{fsVersion}
          </div>
        </aside>

        {/* Editor */}
        <div
          className="flex min-w-0 flex-1 flex-col"
          style={{ background: BG_DEEP }}
        >
          <div className="flex min-h-0 flex-1">
            <Gutter lineCount={lineCount} gutterRef={gutterRef} />
            <textarea
              ref={taRef}
              value={content}
              onChange={handleContentChange}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              wrap="off"
              placeholder="// open a file from the tree, or click New"
              className="min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-[12px] leading-[1.4] outline-none"
              style={{
                color: PHOSPHOR_BRIGHT,
                fontFamily: 'var(--font-mono), ui-monospace, monospace',
                caretColor: PHOSPHOR,
              }}
              aria-label="Code editor"
            />
          </div>

          {/* Console */}
          <div
            className="flex shrink-0 flex-col border-t"
            style={{
              borderColor: BORDER,
              background: CARD,
              height: '38%',
              minHeight: 80,
            }}
          >
            <div
              className="flex shrink-0 items-center gap-2 border-b px-2 py-0.5"
              style={{ borderColor: BORDER }}
            >
              <span
                className="text-[9px] uppercase tracking-[0.2em]"
                style={{ color: PHOSPHOR_DIM }}
              >
                Console
              </span>
              <span
                className="text-[9px] tabular-nums"
                style={{ color: PHOSPHOR_DIM }}
              >
                {consoleLines.length}
              </span>
              <button
                type="button"
                onClick={handleClear}
                className="ml-auto flex items-center gap-1 border px-1.5 py-0.5 text-[9px] uppercase tracking-wider transition hover:opacity-100"
                style={{ borderColor: BORDER, color: PHOSPHOR_DIM, opacity: 0.85 }}
                aria-label="Clear console"
              >
                <Eraser className="h-3 w-3" />
                Clear
              </button>
            </div>
            <div
              ref={consoleRef}
              className="min-h-0 flex-1 overflow-y-auto py-0.5"
              role="log"
              aria-live="polite"
            >
              {consoleLines.length === 0 ? (
                <div
                  className="px-2 py-1 text-[11px]"
                  style={{ color: PHOSPHOR_DIM }}
                >
                  ▸ output will appear here
                </div>
              ) : (
                consoleLines.map((l) => <ConsoleRow key={l.id} line={l} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Register the app (side-effect of import)
// ============================================================

registerApp({
  id: 'code-editor',
  name: 'Code Editor',
  icon: <Code2 className="h-4 w-4" />,
  component: CodeEditorApp,
  defaultSize: { x: 100, y: 80, w: 820, h: 560 },
  minSize: { x: 0, y: 0, w: 480, h: 320 },
  singleton: true,
  pinned: true,
  category: 'dev',
})

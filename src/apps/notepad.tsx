'use client'

// ============================================================
// NEXUS OS — Notepad App
//
// Simple text editor over the VFS (fs-store).
//
//   • Menu bar: File (New, Open, Save, Save As), Edit (Find), Help
//   • Textarea (full, mono, phosphor)
//   • Status bar: line/col, char count, modified indicator
//   • Opens via launch-params (filePath) — file-manager double-click
//   • Save via fs-store.writeFile. Save As prompts for path.
//   • Non-singleton: each instance is a fresh window.
//
// All colours via CSS vars. No hardcoded literals.
// ============================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  StickyNote,
  File as FileIcon,
  FolderOpen,
  Save,
  SaveAll,
  FilePlus2,
  Search,
  HelpCircle,
  X,
  ChevronDown,
} from 'lucide-react'
import { useFsStore } from '@/stores/fs-store'
import { pathOf } from '@/lib/os/vfs'
import type { FSNode, WindowComponentProps } from '@/lib/os/types'
import {
  useLaunchParams,
  clearLaunchParams,
} from '@/lib/os/launch-params'
import { registerApp, openApp } from './registry'
import { toast } from 'sonner'

// ----- constants -----------------------------------------------------

const PHOSPHOR = 'var(--phosphor)'
const PHOSPHOR_BRIGHT = 'var(--phosphor-bright)'
const PHOSPHOR_DIM = 'var(--phosphor-dim)'
const BG_DEEP = 'var(--bg-deep)'
const BORDER = 'var(--border)'
const CARD = 'var(--card)'
const AMBER = 'var(--pip-amber)'
const MAGENTA = 'var(--cyber-magenta)'
const CYAN = 'var(--cyber-cyan)'

// ----- helpers -------------------------------------------------------

function findNodeByPath(vfs: Record<string, FSNode>, path: string): FSNode | null {
  for (const id in vfs) {
    const n = vfs[id]
    if (n.type === 'file' && pathOf(vfs, n.id) === path) return n
  }
  return null
}

// ============================================================
// Notepad
// ============================================================

export function NotepadApp({ windowId }: WindowComponentProps) {
  const vfs = useFsStore((s) => s.vfs)
  const writeFile = useFsStore((s) => s.writeFile)

  // ---- editor state ----
  const [filePath, setFilePath] = useState<string | null>(null)
  const [savedContent, setSavedContent] = useState('')
  const [content, setContent] = useState('')
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [menuOpen, setMenuOpen] = useState<'file' | 'edit' | 'help' | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIdx, setFindIdx] = useState(0)
  const [findMatches, setFindMatches] = useState<number[]>([])

  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const dirtyRef = useRef(false)
  const params = useLaunchParams(windowId)

  const dirty = content !== savedContent

  // Mirror `dirty` into a ref so the launch-params effect doesn't
  // need `dirty` as a dep (avoids re-running on every keystroke).
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  // ---- file ops ----

  const loadFile = useCallback(
    (path: string) => {
      const node = findNodeByPath(vfs, path)
      if (!node || node.type !== 'file') {
        toast.error(`Cannot open: ${path}`)
        return
      }
      const next = node.content ?? ''
      setFilePath(path)
      setSavedContent(next)
      setContent(next)
    },
    [vfs]
  )

  // Auto-load file from launch-params (file-manager double-click).
  useEffect(() => {
    const fp = params.filePath
    if (typeof fp !== 'string' || !fp) return
    if (dirtyRef.current && fp !== filePath) {
      if (!window.confirm(`Discard unsaved changes to ${filePath ?? 'untitled'}?`)) {
        clearLaunchParams(windowId)
        return
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing external launch-params signal into local editor state
    loadFile(fp)
    clearLaunchParams(windowId)
  }, [params.filePath, loadFile, windowId, filePath])

  const newFile = useCallback(() => {
    if (dirtyRef.current) {
      if (!window.confirm('Discard unsaved changes?')) return
    }
    setFilePath(null)
    setSavedContent('')
    setContent('')
    setFindOpen(false)
  }, [])

  const openFile = useCallback(() => {
    const path = window.prompt('Open file (path):')
    if (!path) return
    if (dirtyRef.current) {
      if (!window.confirm('Discard unsaved changes?')) return
    }
    loadFile(path)
  }, [loadFile])

  const saveFile = useCallback(() => {
    if (!filePath) {
      // Save As
      const path = window.prompt('Save as (path):')
      if (!path) return
      const r = writeFile(path, content)
      if (!r.ok) {
        toast.error(`Save failed: ${r.error}`)
        return
      }
      setFilePath(r.path)
      setSavedContent(content)
      toast.success(`Saved ${r.path}`)
      return
    }
    const r = writeFile(filePath, content)
    if (!r.ok) {
      toast.error(`Save failed: ${r.error}`)
      return
    }
    setSavedContent(content)
    toast.success('Saved')
  }, [filePath, content, writeFile])

  const saveAs = useCallback(() => {
    const path = window.prompt('Save as (path):', filePath ?? '/home/nexus/documents/untitled.txt')
    if (!path) return
    const r = writeFile(path, content)
    if (!r.ok) {
      toast.error(`Save As failed: ${r.error}`)
      return
    }
    setFilePath(r.path)
    setSavedContent(content)
    toast.success(`Saved ${r.path}`)
  }, [filePath, content, writeFile])

  // ---- textarea handlers ----

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
  }, [])

  const updateCursor = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const before = ta.value.slice(0, pos)
    const lines = before.split('\n')
    setCursor({
      line: lines.length,
      col: (lines[lines.length - 1]?.length ?? 0) + 1,
    })
  }, [])

  const handleSelect = useCallback(() => {
    updateCursor()
  }, [updateCursor])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveFile()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setFindOpen(true)
      }
    },
    [saveFile]
  )

  // ---- find ----

  useEffect(() => {
    if (!findOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing find state when panel closes
      setFindMatches([])
      setFindIdx(0)
      return
    }
    if (!findQuery) {
      setFindMatches([])
      setFindIdx(0)
      return
    }
    // find all match indices
    const matches: number[] = []
    const q = findQuery.toLowerCase()
    const text = content.toLowerCase()
    let i = 0
    while (i < text.length) {
      const j = text.indexOf(q, i)
      if (j < 0) break
      matches.push(j)
      i = j + 1
    }
    setFindMatches(matches)
    setFindIdx(0)
  }, [findOpen, findQuery, content])

  const highlightMatch = useCallback((idx: number) => {
    const ta = taRef.current
    if (!ta) return
    if (idx < 0 || idx >= findMatches.length) return
    const pos = findMatches[idx]
    const len = findQuery.length
    ta.focus()
    ta.setSelectionRange(pos, pos + len)
    updateCursor()
  }, [findMatches, findQuery, updateCursor])

  const findNext = useCallback(() => {
    if (findMatches.length === 0) return
    const next = (findIdx + 1) % findMatches.length
    setFindIdx(next)
    highlightMatch(next)
  }, [findMatches, findIdx, highlightMatch])

  const findPrev = useCallback(() => {
    if (findMatches.length === 0) return
    const prev = (findIdx - 1 + findMatches.length) % findMatches.length
    setFindIdx(prev)
    highlightMatch(prev)
  }, [findMatches, findIdx, highlightMatch])

  // ---- menu ----

  const runMenuAction = useCallback(
    (action: string) => {
      setMenuOpen(null)
      switch (action) {
        case 'new':
          newFile()
          break
        case 'open':
          openFile()
          break
        case 'save':
          saveFile()
          break
        case 'saveas':
          saveAs()
          break
        case 'find':
          setFindOpen(true)
          break
        case 'help':
          toast.message('NEXUS Notepad — text editor for the VFS', {
            description: 'Ctrl+S to save, Ctrl+F to find. Click Files to open file-manager.',
          })
          break
        case 'open-files':
          openApp('file-manager')
          break
      }
    },
    [newFile, openFile, saveFile, saveAs]
  )

  // Close menus on outside click / Esc
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && !target.closest('[data-menu-root]')) setMenuOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(null)
        setFindOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // ---- derived ----

  const charCount = content.length
  const lineCount = useMemo(
    () => (content ? content.split('\n').length : 1),
    [content]
  )

  const filename = filePath ? filePath.split('/').pop() ?? filePath : 'untitled.txt'

  // ---- render ----

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ background: BG_DEEP, color: PHOSPHOR, fontFamily: 'var(--font-mono), ui-monospace, monospace' }}
    >
      {/* Menu bar */}
      <div
        data-menu-root
        className="flex shrink-0 items-center gap-1 border-b px-1 py-0.5"
        style={{ borderColor: BORDER, background: CARD }}
      >
        <MenuButton
          label="File"
          open={menuOpen === 'file'}
          onClick={() => setMenuOpen((m) => (m === 'file' ? null : 'file'))}
        >
          <MenuItem icon={<FilePlus2 className="h-3 w-3" />} label="New" shortcut="Ctrl+N" onClick={() => runMenuAction('new')} />
          <MenuItem icon={<FolderOpen className="h-3 w-3" />} label="Open…" onClick={() => runMenuAction('open')} />
          <MenuSeparator />
          <MenuItem icon={<Save className="h-3 w-3" />} label="Save" shortcut="Ctrl+S" onClick={() => runMenuAction('save')} />
          <MenuItem icon={<SaveAll className="h-3 w-3" />} label="Save As…" onClick={() => runMenuAction('saveas')} />
        </MenuButton>
        <MenuButton
          label="Edit"
          open={menuOpen === 'edit'}
          onClick={() => setMenuOpen((m) => (m === 'edit' ? null : 'edit'))}
        >
          <MenuItem icon={<Search className="h-3 w-3" />} label="Find…" shortcut="Ctrl+F" onClick={() => runMenuAction('find')} />
        </MenuButton>
        <MenuButton
          label="Help"
          open={menuOpen === 'help'}
          onClick={() => setMenuOpen((m) => (m === 'help' ? null : 'help'))}
        >
          <MenuItem icon={<HelpCircle className="h-3 w-3" />} label="About Notepad" onClick={() => runMenuAction('help')} />
          <MenuItem icon={<FileIcon className="h-3 w-3" />} label="Open Files app" onClick={() => runMenuAction('open-files')} />
        </MenuButton>

        <div
          className="ml-auto flex min-w-0 items-center gap-1 px-1 text-[10px]"
          style={{ color: PHOSPHOR_DIM }}
        >
          <StickyNote className="h-3 w-3 shrink-0" />
          <span className="truncate" style={{ color: PHOSPHOR_BRIGHT }}>{filename}</span>
          {dirty && <span style={{ color: AMBER }}>*</span>}
        </div>
      </div>

      {/* Find bar */}
      {findOpen && (
        <div
          className="flex shrink-0 items-center gap-2 border-b px-2 py-1"
          style={{ borderColor: BORDER, background: CARD }}
        >
          <Search className="h-3 w-3" style={{ color: PHOSPHOR_DIM }} />
          <input
            autoFocus
            placeholder="Find…"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) findPrev()
                else findNext()
              }
              if (e.key === 'Escape') setFindOpen(false)
            }}
            className="min-w-0 flex-1 border bg-transparent px-1 text-[11px] outline-none"
            style={{ borderColor: BORDER, color: PHOSPHOR_BRIGHT }}
          />
          <span className="shrink-0 text-[9px] uppercase" style={{ color: PHOSPHOR_DIM }}>
            {findMatches.length > 0 ? `${findIdx + 1}/${findMatches.length}` : '0/0'}
          </span>
          <button
            type="button"
            onClick={findPrev}
            className="border px-1.5 py-0.5 text-[9px] uppercase transition hover:opacity-100"
            style={{ borderColor: BORDER, color: PHOSPHOR, opacity: 0.85 }}
            aria-label="Previous match"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={findNext}
            className="border px-1.5 py-0.5 text-[9px] uppercase transition hover:opacity-100"
            style={{ borderColor: BORDER, color: PHOSPHOR, opacity: 0.85 }}
            aria-label="Next match"
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => setFindOpen(false)}
            aria-label="Close find"
            className="flex h-5 w-5 items-center justify-center border transition hover:opacity-100"
            style={{ borderColor: BORDER, color: MAGENTA, opacity: 0.85 }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={taRef}
        value={content}
        onChange={handleChange}
        onSelect={handleSelect}
        onClick={handleSelect}
        onKeyUp={updateCursor}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        wrap="off"
        placeholder="Type here…"
        className="min-h-0 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-[12px] leading-[1.5] outline-none"
        style={{
          color: PHOSPHOR_BRIGHT,
          fontFamily: 'var(--font-mono), ui-monospace, monospace',
          caretColor: PHOSPHOR,
        }}
        aria-label="Notepad text"
      />

      {/* Status bar */}
      <div
        className="flex shrink-0 items-center gap-3 border-t px-2 py-0.5 text-[9px] uppercase tracking-widest"
        style={{ borderColor: BORDER, background: CARD, color: PHOSPHOR_DIM }}
      >
        <span>
          Ln {cursor.line}, Col {cursor.col}
        </span>
        <span>{charCount} chars</span>
        <span>{lineCount} lines</span>
        {dirty ? (
          <span style={{ color: AMBER }}>Modified</span>
        ) : (
          <span style={{ color: CYAN }}>Saved</span>
        )}
        <span className="ml-auto truncate" title={filePath ?? 'untitled'}>
          {filePath ?? 'untitled'}
        </span>
      </div>
    </div>
  )
}

// ----- menu primitives ----------------------------------------------

function MenuButton({
  label,
  open,
  onClick,
  children,
}: {
  label: string
  open: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-widest transition"
        style={{
          color: open ? PHOSPHOR_BRIGHT : PHOSPHOR,
          background: open ? 'var(--phosphor-deep)' : 'transparent',
        }}
      >
        {label}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 min-w-[180px] border py-0.5"
          style={{
            borderColor: BORDER,
            background: CARD,
            color: PHOSPHOR,
            borderRadius: 'var(--radius)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
          }}
          role="menu"
        >
          {children}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: ReactNode
  label: string
  shortcut?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] transition hover:bg-[var(--accent)]"
      style={{ color: PHOSPHOR }}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[9px] uppercase opacity-50" style={{ color: PHOSPHOR_DIM }}>
          {shortcut}
        </span>
      )}
    </button>
  )
}

function MenuSeparator() {
  return <div className="my-0.5 h-px" style={{ background: BORDER }} />
}

// ============================================================
// Register the app (side-effect of import)
// ============================================================

registerApp({
  id: 'notepad',
  name: 'Notepad',
  icon: <StickyNote className="h-4 w-4" />,
  component: NotepadApp,
  defaultSize: { x: 120, y: 80, w: 600, h: 440 },
  minSize: { x: 0, y: 0, w: 300, h: 200 },
  singleton: false,
  pinned: false,
  category: 'apps',
})

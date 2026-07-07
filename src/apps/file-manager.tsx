'use client'

// ============================================================
// NEXUS OS — File Manager App
//
// GUI file manager over the VFS (fs-store).
//
//   • Left sidebar: quick locations (Home, Documents, Projects,
//     /etc, /tmp)
//   • Breadcrumb address bar
//   • Main: list of files/folders. Double-click folder navigates;
//     double-click file opens in Notepad (.txt/.md) or Code Editor
//     (.js/.ts/.py/.json) via openApp + setLaunchParams.
//   • Toolbar: Back, Forward, Up, New Folder, New File, Refresh, Delete
//   • Right-click context menu: Open, Rename, Delete, Copy Path
//   • Status bar: item count + selected
//   • Rename inline. Delete with AlertDialog confirm.
//
// All ops go through fs-store. All colours via CSS vars.
// ============================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  FolderOpen,
  Folder,
  File as FileIcon,
  FileCode,
  FileJson,
  FileText,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FolderPlus,
  FilePlus2,
  RefreshCw,
  Trash2,
  Home,
  FileText as DocIcon,
  FolderTree,
  Server,
  HardDrive,
  Pencil,
  ClipboardCopy,
  CornerDownRight,
} from 'lucide-react'
import { useFsStore, HOME } from '@/stores/fs-store'
import type { FSNode, WindowComponentProps } from '@/lib/os/types'
import { openApp } from './registry'
import { setLaunchParams } from '@/lib/os/launch-params'
import { registerApp } from './registry'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { toast } from 'sonner'

// ----- constants -----------------------------------------------------

const PHOSPHOR = 'var(--phosphor)'
const PHOSPHOR_BRIGHT = 'var(--phosphor-bright)'
const PHOSPHOR_DIM = 'var(--phosphor-dim)'
const BG_DEEP = 'var(--bg-deep)'
const BORDER = 'var(--border)'
const CARD = 'var(--card)'
const CYAN = 'var(--cyber-cyan)'
const MAGENTA = 'var(--cyber-magenta)'
const AMBER = 'var(--pip-amber)'

const QUICK_LOCATIONS: { label: string; path: string; icon: ReactNode }[] = [
  { label: 'Home', path: HOME, icon: <Home className="h-3.5 w-3.5" /> },
  { label: 'Documents', path: `${HOME}/documents`, icon: <DocIcon className="h-3.5 w-3.5" /> },
  { label: 'Projects', path: `${HOME}/projects`, icon: <FolderTree className="h-3.5 w-3.5" /> },
  { label: '/etc', path: '/etc', icon: <Server className="h-3.5 w-3.5" /> },
  { label: '/tmp', path: '/tmp', icon: <HardDrive className="h-3.5 w-3.5" /> },
]

// ----- helpers -------------------------------------------------------

function iconFor(node: FSNode): ReactNode {
  if (node.type === 'dir') return <Folder className="h-4 w-4" style={{ color: CYAN }} />
  const lower = node.name.toLowerCase()
  if (lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.py'))
    return <FileCode className="h-4 w-4" style={{ color: PHOSPHOR_BRIGHT }} />
  if (lower.endsWith('.json')) return <FileJson className="h-4 w-4" style={{ color: AMBER }} />
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return <FileText className="h-4 w-4" style={{ color: PHOSPHOR }} />
  return <FileIcon className="h-4 w-4" style={{ color: PHOSPHOR_DIM }} />
}

/** Returns 'code-editor' or 'notepad' based on filename extension. */
function openerFor(name: string): 'code-editor' | 'notepad' {
  const lower = name.toLowerCase()
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.py') ||
    lower.endsWith('.json')
  ) {
    return 'code-editor'
  }
  return 'notepad'
}

function parentPath(path: string): string {
  if (path === '/') return '/'
  const segs = path.split('/').filter(Boolean)
  segs.pop()
  return '/' + segs.join('/')
}

function basename(path: string): string {
  const segs = path.split('/').filter(Boolean)
  return segs[segs.length - 1] ?? '/'
}

// ----- main component ------------------------------------------------

export function FileManagerApp(_: WindowComponentProps) {
  const vfs = useFsStore((s) => s.vfs)
  const fsVersion = useFsStore((s) => s.version)
  const listDir = useFsStore((s) => s.listDir)
  const createDir = useFsStore((s) => s.createDir)
  const createFile = useFsStore((s) => s.createFile)
  const remove = useFsStore((s) => s.remove)
  const rename = useFsStore((s) => s.rename)
  const setCwd = useFsStore((s) => s.setCwd)

  // ---- navigation state ----
  const [cwd, setCwdLocal] = useState<string>(HOME)
  const [history, setHistory] = useState<string[]>([HOME])
  const [histIdx, setHistIdx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ path: string; isDir: boolean; name: string } | null>(null)

  // ---- navigation handlers ----

  const navigate = useCallback(
    (path: string) => {
      const r = setCwd(path)
      if (!r.ok) {
        toast.error(`Cannot open: ${r.error}`)
        return
      }
      setCwdLocal(r.path)
      setSelected(null)
      setRenaming(null)
      // truncate forward history
      setHistory((prev) => {
        const next = prev.slice(0, histIdx + 1)
        if (next[next.length - 1] !== r.path) next.push(r.path)
        return next
      })
      setHistIdx((i) => i + 1)
    },
    [setCwd, histIdx]
  )

  const goBack = useCallback(() => {
    if (histIdx <= 0) return
    const newIdx = histIdx - 1
    const target = history[newIdx]
    const r = setCwd(target)
    if (r.ok) {
      setCwdLocal(r.path)
      setHistIdx(newIdx)
      setSelected(null)
    }
  }, [histIdx, history, setCwd])

  const goForward = useCallback(() => {
    if (histIdx >= history.length - 1) return
    const newIdx = histIdx + 1
    const target = history[newIdx]
    const r = setCwd(target)
    if (r.ok) {
      setCwdLocal(r.path)
      setHistIdx(newIdx)
      setSelected(null)
    }
  }, [histIdx, history, setCwd])

  const goUp = useCallback(() => {
    if (cwd === '/') return
    navigate(parentPath(cwd))
  }, [cwd, navigate])

  const refresh = useCallback(() => {
    // bump a no-op state to force re-read (fsVersion already drives
    // re-render via the store subscription)
    setSelected(null)
    setRenaming(null)
  }, [])

  // ---- listing (derived from cwd + vfs) ----
  const entries = useMemo<FSNode[]>(() => {
    void fsVersion // recompute when fs changes
    const list = listDir(cwd)
    return list ?? []
  }, [listDir, cwd, fsVersion])

  // ---- file ops ----

  const openEntry = useCallback(
    (node: FSNode) => {
      const nodePath = node.name === '/' ? '/' : `${cwd === '/' ? '' : cwd}/${node.name}`
      if (node.type === 'dir') {
        navigate(nodePath)
        return
      }
      // Open file in code-editor or notepad via launch-params.
      const appId = openerFor(node.name)
      const winId = openApp(appId)
      if (!winId) {
        toast.error(`Could not open ${appId}`)
        return
      }
      setLaunchParams(winId, { filePath: nodePath })
    },
    [cwd, navigate]
  )

  const handleNewFolder = useCallback(() => {
    const name = window.prompt('New folder name:')
    if (!name) return
    const path = `${cwd === '/' ? '' : cwd}/${name}`
    const r = createDir(path)
    if (!r.ok) {
      toast.error(`Create folder failed: ${r.error}`)
      return
    }
    toast.success(`Created ${name}/`)
  }, [cwd, createDir])

  const handleNewFile = useCallback(() => {
    const name = window.prompt('New file name:')
    if (!name) return
    const path = `${cwd === '/' ? '' : cwd}/${name}`
    const r = createFile(path, '')
    if (!r.ok) {
      toast.error(`Create file failed: ${r.error}`)
      return
    }
    toast.success(`Created ${name}`)
  }, [cwd, createFile])

  const handleDelete = useCallback((node: FSNode) => {
    const path = `${cwd === '/' ? '' : cwd}/${node.name}`
    setPendingDelete({ path, isDir: node.type === 'dir', name: node.name })
  }, [cwd])

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    const r = remove(pendingDelete.path)
    if (!r.ok) {
      toast.error(`Delete failed: ${r.error}`)
    } else {
      toast.success(`Deleted ${pendingDelete.name}`)
      if (selected === pendingDelete.path) setSelected(null)
    }
    setPendingDelete(null)
  }, [pendingDelete, remove, selected])

  const startRename = useCallback((node: FSNode) => {
    setRenaming(node.id)
    setRenameValue(node.name)
  }, [])

  const commitRename = useCallback(
    (node: FSNode) => {
      if (!renaming) return
      const newName = renameValue.trim()
      if (!newName || newName === node.name) {
        setRenaming(null)
        return
      }
      const path = `${cwd === '/' ? '' : cwd}/${node.name}`
      const r = rename(path, newName)
      if (!r.ok) {
        toast.error(`Rename failed: ${r.error}`)
      } else {
        toast.success(`Renamed to ${newName}`)
      }
      setRenaming(null)
    },
    [renaming, renameValue, cwd, rename]
  )

  const copyPath = useCallback(
    (node: FSNode) => {
      const path = `${cwd === '/' ? '' : cwd}/${node.name}`
      void navigator.clipboard?.writeText(path).then(
        () => toast.success(`Copied: ${path}`),
        () => toast.error('Clipboard write failed')
      )
    },
    [cwd]
  )

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept typing in inputs / when renaming
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        goUp()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goUp])

  // ---- breadcrumb segments ----
  const breadcrumbs = useMemo(() => {
    const segs = cwd.split('/').filter(Boolean)
    const out: { label: string; path: string }[] = [{ label: '/', path: '/' }]
    let cur = ''
    for (const s of segs) {
      cur += `/${s}`
      out.push({ label: s, path: cur })
    }
    return out
  }, [cwd])

  // ---- render ----

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ background: BG_DEEP, color: PHOSPHOR, fontFamily: 'var(--font-mono), ui-monospace, monospace' }}
    >
      {/* Toolbar */}
      <div
        className="flex shrink-0 items-center gap-1 border-b px-2 py-1"
        style={{ borderColor: BORDER, background: CARD }}
      >
        <TBtn label="Back" onClick={goBack} disabled={histIdx <= 0}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn label="Forward" onClick={goForward} disabled={histIdx >= history.length - 1}>
          <ArrowRight className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn label="Up" onClick={goUp} disabled={cwd === '/'}>
          <ArrowUp className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn label="New Folder" onClick={handleNewFolder}>
          <FolderPlus className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn label="New File" onClick={handleNewFile}>
          <FilePlus2 className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn label="Refresh" onClick={refresh}>
          <RefreshCw className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn
          label="Delete"
          onClick={() => {
            if (!selected) {
              toast.error('Select an item first')
              return
            }
            const node = entries.find((n) => `${cwd === '/' ? '' : cwd}/${n.name}` === selected)
            if (node) handleDelete(node)
          }}
          disabled={!selected}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </TBtn>
      </div>

      {/* Body: sidebar + main */}
      <div className="flex min-h-0 flex-1">
        {/* Quick locations sidebar */}
        <aside
          className="hidden w-36 shrink-0 flex-col border-r sm:flex md:w-44"
          style={{ borderColor: BORDER, background: CARD }}
          aria-label="Quick locations"
        >
          <div
            className="shrink-0 border-b px-2 py-1 text-[9px] uppercase tracking-[0.2em]"
            style={{ borderColor: BORDER, color: PHOSPHOR_DIM }}
          >
            Locations
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {QUICK_LOCATIONS.map((loc) => {
              const active = cwd === loc.path
              return (
                <button
                  key={loc.path}
                  type="button"
                  onClick={() => navigate(loc.path)}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] transition hover:bg-[var(--accent)]"
                  style={{
                    color: active ? PHOSPHOR_BRIGHT : PHOSPHOR,
                    background: active ? 'var(--phosphor-deep)' : 'transparent',
                  }}
                >
                  <span className="shrink-0">{loc.icon}</span>
                  <span className="truncate">{loc.label}</span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* Main column: breadcrumb + list + status */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Breadcrumb */}
          <div
            className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2 py-1 text-[11px]"
            style={{ borderColor: BORDER, background: CARD }}
            aria-label="Current path"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" style={{ color: CYAN }} />
            {breadcrumbs.map((b, i) => (
              <span key={b.path} className="flex shrink-0 items-center gap-1">
                {i > 0 && <span style={{ color: PHOSPHOR_DIM }}>/</span>}
                <button
                  type="button"
                  onClick={() => navigate(b.path)}
                  className="transition hover:underline"
                  style={{ color: i === breadcrumbs.length - 1 ? PHOSPHOR_BRIGHT : PHOSPHOR }}
                >
                  {b.label}
                </button>
              </span>
            ))}
          </div>

          {/* File list */}
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            role="list"
            aria-label="Files"
          >
            {entries.length === 0 ? (
              <div
                className="flex h-full flex-col items-center justify-center gap-2 text-[11px]"
                style={{ color: PHOSPHOR_DIM }}
              >
                <FolderOpen className="h-6 w-6 opacity-40" />
                <span>empty directory</span>
              </div>
            ) : (
              <div className="py-0.5">
                {entries.map((node) => {
                  const path = `${cwd === '/' ? '' : cwd}/${node.name}`
                  const isSel = selected === path
                  const isRenaming = renaming === node.id
                  return (
                    <ContextMenu key={node.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          role="listitem"
                          tabIndex={0}
                          onClick={() => setSelected(path)}
                          onDoubleClick={() => openEntry(node)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') openEntry(node)
                            if (e.key === 'F2') startRename(node)
                            if (e.key === 'Delete') handleDelete(node)
                          }}
                          className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[11px] select-none"
                          style={{
                            color: node.type === 'dir' ? CYAN : PHOSPHOR,
                            background: isSel ? 'var(--phosphor-deep)' : 'transparent',
                          }}
                        >
                          <span className="shrink-0">{iconFor(node)}</span>
                          {isRenaming ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => commitRename(node)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename(node)
                                if (e.key === 'Escape') setRenaming(null)
                              }}
                              className="min-w-0 flex-1 border bg-transparent px-1 text-[11px] outline-none"
                              style={{ borderColor: PHOSPHOR, color: PHOSPHOR_BRIGHT }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className="min-w-0 flex-1 truncate">
                              {node.name}
                              {node.type === 'dir' && '/'}
                            </span>
                          )}
                          <span className="shrink-0 text-[9px] uppercase opacity-50" style={{ color: PHOSPHOR_DIM }}>
                            {node.type === 'dir' ? 'dir' : 'file'}
                          </span>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent
                        className="border"
                        style={{
                          borderColor: BORDER,
                          background: CARD,
                          color: PHOSPHOR,
                          borderRadius: 'var(--radius)',
                        }}
                      >
                        <ContextMenuItem
                          onSelect={() => openEntry(node)}
                          className="text-[11px] uppercase tracking-wider"
                        >
                          <CornerDownRight className="mr-2 h-3 w-3" />
                          Open
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => startRename(node)}
                          className="text-[11px] uppercase tracking-wider"
                        >
                          <Pencil className="mr-2 h-3 w-3" />
                          Rename
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => copyPath(node)}
                          className="text-[11px] uppercase tracking-wider"
                        >
                          <ClipboardCopy className="mr-2 h-3 w-3" />
                          Copy Path
                        </ContextMenuItem>
                        <ContextMenuSeparator style={{ background: BORDER }} />
                        <ContextMenuItem
                          onSelect={() => handleDelete(node)}
                          className="text-[11px] uppercase tracking-wider"
                          style={{ color: MAGENTA }}
                        >
                          <Trash2 className="mr-2 h-3 w-3" />
                          Delete
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}
              </div>
            )}
          </div>

          {/* Status bar */}
          <div
            className="flex shrink-0 items-center gap-3 border-t px-2 py-0.5 text-[9px] uppercase tracking-widest"
            style={{ borderColor: BORDER, background: CARD, color: PHOSPHOR_DIM }}
          >
            <span>{entries.length} items</span>
            {selected && (
              <span style={{ color: PHOSPHOR }}>
                ▸ {basename(selected)}
              </span>
            )}
            <span className="ml-auto" aria-hidden>
              v{fsVersion}
            </span>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent
          className="border"
          style={{
            borderColor: BORDER,
            background: CARD,
            color: PHOSPHOR,
            borderRadius: 'var(--radius)',
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm uppercase tracking-widest" style={{ color: MAGENTA }}>
              Confirm Delete
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[11px]" style={{ color: PHOSPHOR_DIM }}>
              {pendingDelete?.isDir
                ? `Delete directory "${pendingDelete?.name}" and ALL of its contents?`
                : `Delete file "${pendingDelete?.name}"?`}
              <br />
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border text-[10px] uppercase tracking-widest"
              style={{ borderColor: BORDER, color: PHOSPHOR }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="border text-[10px] uppercase tracking-widest"
              style={{ borderColor: MAGENTA, background: MAGENTA, color: BG_DEEP }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ----- toolbar button (small, inline) -------------------------------

function TBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 items-center justify-center border transition hover:opacity-100 disabled:opacity-30"
      style={{
        borderColor: BORDER,
        color: PHOSPHOR,
        opacity: 0.85,
        borderRadius: 'var(--radius)',
      }}
    >
      {children}
    </button>
  )
}

// ============================================================
// Register the app (side-effect of import)
// ============================================================

registerApp({
  id: 'file-manager',
  name: 'Files',
  icon: <FolderOpen className="h-4 w-4" />,
  component: FileManagerApp,
  defaultSize: { x: 80, y: 60, w: 760, h: 500 },
  minSize: { x: 0, y: 0, w: 400, h: 300 },
  singleton: true,
  pinned: true,
  category: 'system',
})

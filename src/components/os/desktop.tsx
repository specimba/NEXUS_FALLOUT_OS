'use client'

// ============================================================
// NEXUS OS — Desktop
//
// Full-viewport desktop. Renders all open windows, the top taskbar
// (wordmark + clock + system tray), the bottom dock (pinned + running
// apps), a cmdk app launcher (Ctrl/Cmd+Space), desktop icons, and a
// right-click context menu. Auto-opens the Terminal on first mount.
//
// All colours via CSS vars — no hardcoded literals.
// ============================================================

import '@/apps'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useWindowStore } from '@/stores/window-store'
import {
  useSettingsStore,
  WALLPAPERS,
} from '@/stores/settings-store'
import { useApps, openApp, listApps } from '@/apps/registry'
import { Window } from './window'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import type { WallpaperId } from '@/lib/os/types'

const TASKBAR_HEIGHT = 32

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const WALLPAPER_CYCLE: WallpaperId[] = [
  'grid',
  'scanlines',
  'noise',
  'aurora',
  'void',
]

// useSyncExternalStore clock — minute precision. SSR-safe (server
// snapshot = 0 → null) and lint-clean (no setState inside an effect).
function subscribeClock(cb: () => void): () => void {
  const id = setInterval(cb, 5000)
  return () => clearInterval(id)
}

type CtxItem = { label: string; action: () => void }

export function Desktop() {
  const windows = useWindowStore((s) => s.windows)
  const focusedId = useWindowStore((s) => s.focusedId)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const restoreWindow = useWindowStore((s) => s.restoreWindow)

  const apps = useApps()

  const wallpaper = useSettingsStore((s) => s.wallpaper)
  const theme = useSettingsStore((s) => s.theme)
  const crt = useSettingsStore((s) => s.crt)
  const sound = useSettingsStore((s) => s.sound)
  const setCrt = useSettingsStore((s) => s.setCrt)
  const setSound = useSettingsStore((s) => s.setSound)
  const setWallpaper = useSettingsStore((s) => s.setWallpaper)

  const [launcherOpen, setLauncherOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const autoOpened = useRef(false)

  // Live clock via useSyncExternalStore (minute precision, polled every 5s).
  // `now` is derived during render — no setState, no effect.
  const epochMin = useSyncExternalStore(
    subscribeClock,
    () => Math.floor(Date.now() / 60000),
    () => 0
  )
  const now = epochMin > 0 ? new Date(epochMin * 60000) : null

  // Auto-open Terminal on first desktop mount.
  useEffect(() => {
    if (autoOpened.current) return
    autoOpened.current = true
    const t = setTimeout(() => openApp('terminal'), 250)
    return () => clearTimeout(t)
  }, [])

  // Launcher hotkey: Ctrl/Cmd+Space toggles. Esc closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault()
        setLauncherOpen((o) => !o)
        return
      }
      if (e.key === 'Escape') {
        setLauncherOpen(false)
        setCtxMenu(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const wp = WALLPAPERS[wallpaper] ?? WALLPAPERS.grid

  const pinnedApps = apps.filter((a) => a.pinned)
  const runningAppIds = new Set(windows.map((w) => w.appId))
  const dockApps = [
    ...pinnedApps,
    ...apps.filter((a) => runningAppIds.has(a.id) && !a.pinned),
  ]

  const handleDockClick = (appId: string) => {
    const appWins = windows.filter((w) => w.appId === appId)
    if (appWins.length === 0) {
      openApp(appId)
      return
    }
    const top = appWins.reduce((a, b) => (a.z > b.z ? a : b))
    if (top.minimized) {
      restoreWindow(top.id)
    } else if (focusedId === top.id) {
      minimizeWindow(top.id)
    } else {
      focusWindow(top.id)
    }
  }

  const onDesktopContextMenu = (e: React.MouseEvent) => {
    // Don't trigger when right-clicking inside a window
    if ((e.target as HTMLElement).closest('[role="dialog"]')) return
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  const ctxItems: CtxItem[] = [
    { label: 'Open Terminal', action: () => openApp('terminal') },
    {
      label: 'Change Wallpaper',
      action: () => {
        const idx = WALLPAPER_CYCLE.indexOf(wallpaper)
        const next = WALLPAPER_CYCLE[(idx + 1) % WALLPAPER_CYCLE.length]
        setWallpaper(next)
      },
    },
    { label: 'Settings', action: () => openApp('settings') },
    { label: 'About', action: () => openApp('nexus-ai') },
  ]

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{
        background: wp.css,
        color: 'var(--phosphor)',
      }}
      onContextMenu={onDesktopContextMenu}
    >
      {/* Desktop icons (top-left) */}
      <div
        className="absolute left-3 z-0 flex flex-col gap-1"
        style={{ top: TASKBAR_HEIGHT + 8 }}
      >
        {pinnedApps.slice(0, 6).map((app) => (
          <button
            key={app.id}
            type="button"
            onDoubleClick={() => openApp(app.id)}
            className="flex w-20 flex-col items-center gap-1 border border-transparent p-2 text-center transition hover:border-[var(--border)] hover:bg-[var(--card)]"
            style={{ color: 'var(--phosphor-bright)' }}
            title={`Open ${app.name}`}
            aria-label={`Open ${app.name}`}
          >
            <span className="text-xl leading-none">{app.icon}</span>
            <span className="w-full truncate text-[9px] uppercase tracking-wider">
              {app.name}
            </span>
          </button>
        ))}
      </div>

      {/* Windows */}
      <AnimatePresence>
        {windows.map((w) => {
          const app = listApps().find((a) => a.id === w.appId)
          return (
            <Window key={w.id} win={w}>
              {app ? (
                (() => {
                  const Comp = app.component
                  return <Comp windowId={w.id} />
                })()
              ) : (
                <div
                  className="p-4 text-xs opacity-60"
                  style={{ color: 'var(--phosphor-dim)' }}
                >
                  App not registered: {w.appId}
                </div>
              )}
            </Window>
          )
        })}
      </AnimatePresence>

      {/* Taskbar (top) */}
      <header
        className="fixed inset-x-0 top-0 z-[200] flex items-center gap-3 border-b px-3"
        style={{
          height: TASKBAR_HEIGHT,
          borderColor: 'var(--border)',
          background: 'var(--bg-deep)',
          color: 'var(--phosphor)',
        }}
      >
        <button
          type="button"
          onClick={() => setLauncherOpen(true)}
          className="text-sm uppercase tracking-[0.3em]"
          style={{
            color: 'var(--phosphor-bright)',
            textShadow: '0 0 6px var(--phosphor-glow)',
            fontFamily: 'var(--font-display), ui-monospace, monospace',
          }}
          aria-label="Open NEXUS launcher"
        >
          NEXUS
        </button>

        {/* Running window titles (click to focus/minimize) */}
        <div className="hidden items-center gap-1 overflow-x-auto sm:flex">
          {windows
            .filter((w) => !w.minimized)
            .slice(0, 6)
            .map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() =>
                  focusedId === w.id ? minimizeWindow(w.id) : focusWindow(w.id)
                }
                className="max-w-[140px] truncate border px-2 py-0.5 text-[10px] uppercase tracking-wider"
                style={{
                  borderColor:
                    focusedId === w.id ? 'var(--phosphor-dim)' : 'var(--border)',
                  color:
                    focusedId === w.id
                      ? 'var(--phosphor-bright)'
                      : 'var(--phosphor-dim)',
                  background:
                    focusedId === w.id ? 'var(--card)' : 'transparent',
                }}
                title={w.title}
              >
                {w.title}
              </button>
            ))}
        </div>

        <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-widest sm:gap-3">
          <span
            className="hidden uppercase tracking-widest opacity-70 sm:inline"
            title="Active phosphor theme"
          >
            {theme}
          </span>
          <button
            type="button"
            onClick={() => setCrt(!crt)}
            className="border px-2 py-0.5 transition"
            style={{
              borderColor: 'var(--border)',
              opacity: crt ? 1 : 0.45,
              color: crt ? 'var(--phosphor-bright)' : 'var(--phosphor-dim)',
            }}
            aria-label="Toggle CRT overlay"
            aria-pressed={crt}
          >
            CRT
          </button>
          <button
            type="button"
            onClick={() => setSound(!sound)}
            className="border px-2 py-0.5 transition"
            style={{
              borderColor: 'var(--border)',
              opacity: sound ? 1 : 0.45,
              color: sound ? 'var(--phosphor-bright)' : 'var(--phosphor-dim)',
            }}
            aria-label="Toggle sound"
            aria-pressed={sound}
          >
            SND
          </button>
          <span
            className="tabular-nums"
            style={{
              color: 'var(--phosphor-bright)',
              fontFamily: 'var(--font-display), ui-monospace, monospace',
            }}
            aria-live="polite"
          >
            {now ? formatClock(now) : '--:--'}
          </span>
        </div>
      </header>

      {/* Dock (bottom, centered) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-[200] flex items-end justify-center px-2 py-2"
        style={{
          background:
            'linear-gradient(to top, var(--bg-deep) 0%, transparent 100%)',
        }}
        aria-label="Application dock"
      >
        <div
          className="flex max-w-full flex-wrap items-end justify-center gap-1 border px-2 py-1"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 0 0 1px var(--bg-deep), 0 0 18px var(--phosphor-glow)',
          }}
        >
          {dockApps.length === 0 && (
            <span
              className="px-3 py-2 text-[10px] uppercase tracking-widest opacity-50"
              style={{ color: 'var(--phosphor-dim)' }}
            >
              No apps — press Ctrl+Space
            </span>
          )}
          {dockApps.map((app) => {
            const isRunning = runningAppIds.has(app.id)
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => handleDockClick(app.id)}
                className="relative flex h-11 w-11 flex-col items-center justify-center border transition hover:bg-[var(--accent)] sm:h-12 sm:w-12"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--phosphor-bright)',
                  borderRadius: 'var(--radius)',
                }}
                title={app.name}
                aria-label={app.name}
              >
                <span className="text-lg leading-none">{app.icon}</span>
                {isRunning && (
                  <span
                    className="absolute -bottom-0.5 h-1 w-1 rounded-full"
                    style={{
                      background: 'var(--phosphor)',
                      boxShadow: '0 0 6px var(--phosphor-glow)',
                    }}
                    aria-hidden
                  />
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {/* App launcher (cmdk) */}
      <CommandDialog
        open={launcherOpen}
        onOpenChange={setLauncherOpen}
        title="NEXUS Launcher"
        description="Search and launch apps"
      >
        <CommandInput placeholder="Search apps..." autoFocus />
        <CommandList>
          <CommandEmpty>No apps found.</CommandEmpty>
          <CommandGroup heading="Applications">
            {apps.map((app) => (
              <CommandItem
                key={app.id}
                value={`${app.name} ${app.id} ${app.category ?? ''}`}
                onSelect={() => {
                  openApp(app.id)
                  setLauncherOpen(false)
                }}
              >
                <span className="mr-2 text-base" aria-hidden>
                  {app.icon}
                </span>
                <span>{app.name}</span>
                {app.category && (
                  <span
                    className="ml-auto text-[10px] uppercase opacity-50"
                    style={{ color: 'var(--phosphor-dim)' }}
                  >
                    {app.category}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Right-click context menu */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-[250]"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setCtxMenu(null)
            }}
            aria-hidden
          />
          <div
            className="fixed z-[260] min-w-[180px] border py-1"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 200),
              top: Math.min(ctxMenu.y, window.innerHeight - 180),
              borderColor: 'var(--border)',
              background: 'var(--card)',
              color: 'var(--phosphor)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 0 0 1px var(--bg-deep), 0 8px 24px rgba(0,0,0,0.7)',
            }}
            role="menu"
          >
            {ctxItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.action()
                  setCtxMenu(null)
                }}
                className="block w-full px-3 py-1.5 text-left text-[11px] uppercase tracking-widest transition hover:bg-[var(--accent)]"
                style={{ color: 'var(--phosphor)' }}
                role="menuitem"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

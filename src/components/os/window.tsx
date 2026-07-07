'use client'

// ============================================================
// NEXUS OS — Window chrome
//
// Draggable (header) + resizable (bottom-right handle) window.
// Controls: minimize / maximize-restore / close. Z-order via
// focusWindow(). Mobile (<=640px) auto-maximizes on mount.
//
// All colours come from CSS vars — no hardcoded literals.
// ============================================================

import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Minus, Square, X, Copy } from 'lucide-react'
import { useWindowStore } from '@/stores/window-store'
import type { WindowState } from '@/lib/os/types'

const TASKBAR_HEIGHT = 32
const DOCK_RESERVE = 80
const MIN_W = 280
const MIN_H = 180

type DragState = { startX: number; startY: number; origX: number; origY: number }
type ResizeState = { startX: number; startY: number; origW: number; origH: number }

export function Window({
  win,
  children,
}: {
  win: WindowState
  children: ReactNode
}) {
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize)
  const moveWindow = useWindowStore((s) => s.moveWindow)
  const resizeWindow = useWindowStore((s) => s.resizeWindow)
  const focusedId = useWindowStore((s) => s.focusedId)

  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const mobileMaxApplied = useRef(false)

  // Mobile: auto-maximize on first mount.
  useEffect(() => {
    if (mobileMaxApplied.current) return
    mobileMaxApplied.current = true
    if (typeof window !== 'undefined' && window.innerWidth <= 640) {
      if (!win.maximized) toggleMaximize(win.id)
    }
  }, [win.id, win.maximized, toggleMaximize])

  // ----- drag (header) ----------------------------------------------
  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (win.maximized) return
    focusWindow(win.id)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: win.x,
      origY: win.y,
    }
    const move = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      let nx = d.origX + (ev.clientX - d.startX)
      let ny = d.origY + (ev.clientY - d.startY)
      // can't drag above the taskbar
      ny = Math.max(TASKBAR_HEIGHT, ny)
      // keep at least 80px visible horizontally
      const maxX = window.innerWidth - 80
      const minX = -win.w + 80
      nx = Math.min(maxX, Math.max(minX, nx))
      moveWindow(win.id, nx, ny)
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ----- resize (bottom-right handle) -------------------------------
  const onResizePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (win.maximized) return
    e.stopPropagation()
    focusWindow(win.id)
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: win.w,
      origH: win.h,
    }
    const move = (ev: PointerEvent) => {
      const r = resizeRef.current
      if (!r) return
      const nw = Math.max(MIN_W, r.origW + (ev.clientX - r.startX))
      const nh = Math.max(MIN_H, r.origH + (ev.clientY - r.startY))
      resizeWindow(win.id, nw, nh)
    }
    const up = () => {
      resizeRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (win.minimized) return null

  const isFocused = focusedId === win.id

  const positionStyle: React.CSSProperties = win.maximized
    ? {
        left: 0,
        top: TASKBAR_HEIGHT,
        width: '100vw',
        height: `calc(100vh - ${TASKBAR_HEIGHT}px - ${DOCK_RESERVE}px)`,
        zIndex: win.z,
      }
    : {
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        zIndex: win.z,
      }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="absolute flex flex-col overflow-hidden"
      style={{
        ...positionStyle,
        borderColor: isFocused ? 'var(--phosphor-dim)' : 'var(--border)',
        background: 'var(--card)',
        color: 'var(--phosphor)',
        borderRadius: 'var(--radius)',
        boxShadow: isFocused
          ? '0 0 0 1px var(--bg-deep), 0 12px 36px rgba(0,0,0,0.7), 0 0 28px var(--phosphor-glow)'
          : '0 0 0 1px var(--bg-deep), 0 8px 24px rgba(0,0,0,0.6)',
        borderWidth: 1,
      }}
      onPointerDown={() => focusWindow(win.id)}
      role="dialog"
      aria-label={win.title}
    >
      {/* Header bar */}
      <div
        className="flex h-8 shrink-0 cursor-move items-center gap-2 border-b px-2 select-none"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--bg-deep)',
        }}
        onPointerDown={onHeaderPointerDown}
        onDoubleClick={() => toggleMaximize(win.id)}
      >
        <span
          className="truncate text-[11px] uppercase tracking-[0.2em]"
          style={{
            color: isFocused ? 'var(--phosphor-bright)' : 'var(--phosphor-dim)',
          }}
        >
          {win.title}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Minimize"
            onClick={(e) => {
              e.stopPropagation()
              minimizeWindow(win.id)
            }}
            className="flex h-5 w-5 items-center justify-center border transition hover:opacity-100"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--phosphor)',
              opacity: 0.75,
            }}
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label={win.maximized ? 'Restore' : 'Maximize'}
            onClick={(e) => {
              e.stopPropagation()
              toggleMaximize(win.id)
            }}
            className="flex h-5 w-5 items-center justify-center border transition hover:opacity-100"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--phosphor)',
              opacity: 0.75,
            }}
          >
            {win.maximized ? (
              <Copy className="h-3 w-3" />
            ) : (
              <Square className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={(e) => {
              e.stopPropagation()
              closeWindow(win.id)
            }}
            className="flex h-5 w-5 items-center justify-center border transition hover:opacity-100"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--cyber-magenta)',
              opacity: 0.8,
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Body — renders the app component */}
      <div className="relative flex-1 overflow-auto">{children}</div>

      {/* Resize handle */}
      {!win.maximized && (
        <div
          onPointerDown={onResizePointerDown}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          style={{
            background:
              'linear-gradient(135deg, transparent 50%, var(--phosphor-dim) 50%, var(--phosphor-dim) 60%, transparent 60%, transparent 72%, var(--phosphor-dim) 72%, var(--phosphor-dim) 82%, transparent 82%)',
          }}
          aria-label="Resize window"
          role="separator"
        />
      )}
    </motion.div>
  )
}

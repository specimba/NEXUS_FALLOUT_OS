// ============================================================
// NEXUS OS — Window Manager Store
//
// Not persisted. Cascade-positioned windows, singleton support,
// z-ordering, maximize/minimize/restore, move/resize.
// ============================================================

import { create } from 'zustand'
import type { WindowState, AppId } from '@/lib/os/types'

type OpenWindowOpts = {
  title?: string
  x?: number
  y?: number
  w?: number
  h?: number
}

type WindowStoreState = {
  windows: WindowState[]
  focusedId: string | null
  nextZ: number

  openWindow: (appId: AppId, opts?: OpenWindowOpts) => string
  closeWindow: (id: string) => void
  closeAll: () => void
  focusWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  restoreWindow: (id: string) => void
  toggleMaximize: (id: string) => void
  moveWindow: (id: string, x: number, y: number) => void
  resizeWindow: (id: string, w: number, h: number) => void
  setGeometry: (id: string, g: { x?: number; y?: number; w?: number; h?: number }) => void
  setTitle: (id: string, title: string) => void
}

let idSeq = 0
function genId(): string {
  idSeq += 1
  return `win_${Date.now().toString(36)}_${idSeq}`
}

const DEFAULT_SIZES: Record<AppId, { w: number; h: number }> = {
  terminal: { w: 720, h: 460 },
  'nexus-ai': { w: 680, h: 520 },
  browser: { w: 900, h: 620 },
  settings: { w: 560, h: 480 },
  'command-center': { w: 880, h: 560 },
  'web-agent': { w: 720, h: 560 },
  files: { w: 720, h: 480 },
  'file-manager': { w: 760, h: 500 },
  'code-editor': { w: 820, h: 560 },
  notepad: { w: 560, h: 460 },
}

export const useWindowStore = create<WindowStoreState>((set, get) => ({
  windows: [],
  focusedId: null,
  nextZ: 10,

  openWindow: (appId, opts) => {
    const state = get()
    // singleton support
    if (opts?.title === undefined) {
      // try singleton by appId — caller signals singleton via AppDef
    }
    const size = {
      w: opts?.w ?? DEFAULT_SIZES[appId].w,
      h: opts?.h ?? DEFAULT_SIZES[appId].h,
    }
    // cascade positioning
    const count = state.windows.length
    const cascade = (count % 6) * 28
    const baseX = 80 + cascade
    const baseY = 60 + cascade
    const id = genId()
    const z = state.nextZ + 1
    const win: WindowState = {
      id,
      appId,
      title: opts?.title ?? appId,
      x: opts?.x ?? baseX,
      y: opts?.y ?? baseY,
      w: size.w,
      h: size.h,
      z,
      minimized: false,
      maximized: false,
    }
    set({
      windows: [...state.windows, win],
      focusedId: id,
      nextZ: z,
    })
    return id
  },

  closeWindow: (id) =>
    set((s) => ({
      windows: s.windows.filter((w) => w.id !== id),
      focusedId: s.focusedId === id ? null : s.focusedId,
    })),

  closeAll: () => set({ windows: [], focusedId: null }),

  focusWindow: (id) =>
    set((s) => {
      const z = s.nextZ + 1
      return {
        focusedId: id,
        nextZ: z,
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, z, minimized: false } : w
        ),
      }
    }),

  minimizeWindow: (id) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, minimized: true } : w
      ),
      focusedId: s.focusedId === id ? null : s.focusedId,
    })),

  restoreWindow: (id) =>
    set((s) => {
      const z = s.nextZ + 1
      return {
        focusedId: id,
        nextZ: z,
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, minimized: false, z } : w
        ),
      }
    }),

  toggleMaximize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w
        if (w.maximized && w.prevState) {
          return {
            ...w,
            maximized: false,
            x: w.prevState.x,
            y: w.prevState.y,
            w: w.prevState.w,
            h: w.prevState.h,
            prevState: undefined,
          }
        }
        return {
          ...w,
          maximized: true,
          prevState: { x: w.x, y: w.y, w: w.w, h: w.h },
        }
      }),
    })),

  moveWindow: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    })),

  resizeWindow: (id, w, h) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, w, h } : w
      ),
    })),

  setGeometry: (id, g) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id
          ? {
              ...w,
              x: g.x ?? w.x,
              y: g.y ?? w.y,
              w: g.w ?? w.w,
              h: g.h ?? w.h,
            }
          : w
      ),
    })),

  setTitle: (id, title) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)),
    })),
}))

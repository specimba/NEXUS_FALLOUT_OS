// ============================================================
// NEXUS OS — Settings Store
//
// Persisted (localStorage 'nexus:settings:v2') user preferences:
//   username, theme, crt, crtQuality, scanlines, wallpaper, sound
//
// SSR-safe: skipHydration=true — first client render uses defaults
// (matching SSR), then ThemeApplier triggers rehydration in an effect.
// ============================================================

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ThemeId, CrtQuality, WallpaperId } from '@/lib/os/types'

// ----- theme + wallpaper metadata (used by Settings app) ------------

export type PhosphorTheme = {
  id: ThemeId
  name: string
  bg: string
  fg: string
  dim: string
  glow: string
}

export const PHOSPHOR_THEMES: Record<ThemeId, PhosphorTheme> = {
  green: {
    id: 'green',
    name: 'Green Phosphor',
    bg: '#020a02',
    fg: '#33ff66',
    dim: '#1f6b33',
    glow: 'rgba(51,255,102,0.5)',
  },
  amber: {
    id: 'amber',
    name: 'Amber Phosphor',
    bg: '#0b0700',
    fg: '#ffb000',
    dim: '#6b4a00',
    glow: 'rgba(255,176,0,0.5)',
  },
  cyan: {
    id: 'cyan',
    name: 'Cyan Phosphor',
    bg: '#020a0c',
    fg: '#05d9e8',
    dim: '#1a6b73',
    glow: 'rgba(5,217,232,0.5)',
  },
  white: {
    id: 'white',
    name: 'White Monochrome',
    bg: '#050505',
    fg: '#d8d8d8',
    dim: '#5a5a5a',
    glow: 'rgba(216,216,216,0.35)',
  },
}

export const PHOSPHOR_THEME_LIST: PhosphorTheme[] = [
  PHOSPHOR_THEMES.green,
  PHOSPHOR_THEMES.amber,
  PHOSPHOR_THEMES.cyan,
  PHOSPHOR_THEMES.white,
]

export type Wallpaper = {
  id: WallpaperId
  name: string
  css: string
}

export const WALLPAPERS: Record<WallpaperId, Wallpaper> = {
  grid: {
    id: 'grid',
    name: 'Grid',
    css: `
      linear-gradient(var(--border) 1px, transparent 1px),
      linear-gradient(90deg, var(--border) 1px, transparent 1px),
      radial-gradient(ellipse at center, var(--card), var(--bg-deep))
    `,
  },
  scanlines: {
    id: 'scanlines',
    name: 'Scanlines',
    css: `
      repeating-linear-gradient(to bottom, var(--bg-deep) 0px, var(--bg-deep) 2px, var(--background) 3px, var(--background) 4px),
      radial-gradient(ellipse at center, var(--card), var(--bg-deep))
    `,
  },
  noise: {
    id: 'noise',
    name: 'Noise',
    css: `
      radial-gradient(circle at 25% 30%, rgba(51,255,102,0.04), transparent 40%),
      radial-gradient(circle at 75% 70%, rgba(5,217,232,0.04), transparent 40%),
      linear-gradient(var(--bg-deep), var(--background))
    `,
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    css: `
      radial-gradient(ellipse at 20% 0%, rgba(51,255,102,0.12), transparent 50%),
      radial-gradient(ellipse at 80% 20%, rgba(255,42,109,0.08), transparent 50%),
      radial-gradient(ellipse at 50% 100%, rgba(5,217,232,0.1), transparent 50%),
      linear-gradient(var(--bg-deep), var(--background))
    `,
  },
  void: {
    id: 'void',
    name: 'Void',
    css: `radial-gradient(ellipse at center, var(--card) 0%, var(--bg-deep) 70%, #000 100%)`,
  },
}

export const WALLPAPER_LIST: Wallpaper[] = [
  WALLPAPERS.grid,
  WALLPAPERS.scanlines,
  WALLPAPERS.noise,
  WALLPAPERS.aurora,
  WALLPAPERS.void,
]

// ----- store shape ----------------------------------------------------

type SettingsState = {
  username: string
  theme: ThemeId
  crt: boolean
  crtQuality: CrtQuality
  scanlines: number
  wallpaper: WallpaperId
  sound: boolean
  hasHydrated: boolean

  setUsername: (v: string) => void
  setTheme: (v: ThemeId) => void
  setCrt: (v: boolean) => void
  setCrtQuality: (v: CrtQuality) => void
  setScanlines: (v: number) => void
  setWallpaper: (v: WallpaperId) => void
  setSound: (v: boolean) => void
  setHasHydrated: (v: boolean) => void
}

const DEFAULTS = {
  username: 'nexus',
  theme: 'green' as ThemeId,
  crt: true,
  crtQuality: 'subtle' as CrtQuality,
  scanlines: 35,
  wallpaper: 'grid' as WallpaperId,
  sound: false,
}

const isBrowser = () => typeof window !== 'undefined'

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      hasHydrated: false,

      setUsername: (username) => set({ username }),
      setTheme: (theme) => set({ theme }),
      setCrt: (crt) => set({ crt }),
      setCrtQuality: (crtQuality) => set({ crtQuality }),
      setScanlines: (scanlines) =>
        set({ scanlines: Math.max(0, Math.min(100, Math.round(scanlines))) }),
      setWallpaper: (wallpaper) => set({ wallpaper }),
      setSound: (sound) => set({ sound }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'nexus:settings:v2',
      storage: createJSONStorage(() =>
        isBrowser() ? window.localStorage : (undefined as unknown as Storage)
      ),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
      partialize: (s) => ({
        username: s.username,
        theme: s.theme,
        crt: s.crt,
        crtQuality: s.crtQuality,
        scanlines: s.scanlines,
        wallpaper: s.wallpaper,
        sound: s.sound,
      }),
    }
  )
)

/** Hook returning the active PhosphorTheme object. */
export function usePhosphorTheme(): PhosphorTheme {
  return useSettingsStore((s) => PHOSPHOR_THEMES[s.theme] ?? PHOSPHOR_THEMES.green)
}

/** Manually rehydrate from localStorage (called from a client effect). */
export function rehydrateSettings() {
  if (!isBrowser()) return
  useSettingsStore.persist.rehydrate()
}

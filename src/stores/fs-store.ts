// ============================================================
// NEXUS OS — Filesystem Store
//
// Zustand + persist wrapper around the pure-function VFS in
// src/lib/os/vfs.ts. Persists the VFS map + cwd to localStorage
// ('nexus:fs:v1'). Bumps `version` on every mutation so consumers
// can subscribe cheaply for reactivity.
//
// SSR-safe: skipHydration=true; rehydrate from a client effect.
// ============================================================

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { FSMap, FSNode } from '@/lib/os/types'
import {
  createDefaultFS,
  createDir as vfsCreateDir,
  createNode,
  exists as vfsExists,
  getNode,
  listDir as vfsListDir,
  moveNode,
  copyNode,
  pathOf,
  readFile as vfsReadFile,
  removeNode,
  resolveDir as vfsResolveDir,
  resolvePath,
  writeFile as vfsWriteFile,
  HOME,
} from '@/lib/os/vfs'

type FsState = {
  vfs: FSMap
  cwd: string
  version: number
  hasHydrated: boolean

  // queries
  resolve: (path: string) => FSNode | null
  resolveDir: (path: string) => FSNode | null
  readFile: (path: string) => string | null
  listDir: (path: string) => FSNode[] | null
  exists: (path: string) => boolean
  absPath: (path: string) => string
  stat: (path: string) => FSNode | null

  // mutations
  createDir: (path: string) => { ok: true; path: string } | { ok: false; error: string }
  createFile: (path: string, content?: string) => { ok: true; path: string } | { ok: false; error: string }
  writeFile: (path: string, content: string) => { ok: true; path: string } | { ok: false; error: string }
  remove: (path: string) => { ok: true; path: string } | { ok: false; error: string }
  rename: (path: string, newName: string) => { ok: true; path: string } | { ok: false; error: string }
  move: (from: string, to: string) => { ok: true; path: string } | { ok: false; error: string }
  copy: (from: string, to: string) => { ok: true; path: string } | { ok: false; error: string }
  setCwd: (path: string) => { ok: true; path: string } | { ok: false; error: string }
  reset: () => void
  setHasHydrated: (v: boolean) => void
}

const isBrowser = () => typeof window !== 'undefined'

export const useFsStore = create<FsState>()(
  persist(
    (set, get) => ({
      vfs: createDefaultFS(),
      cwd: HOME,
      version: 0,
      hasHydrated: false,

      // ---- queries ------------------------------------------------
      resolve: (path) => getNode(get().vfs, path, get().cwd),
      resolveDir: (path) => vfsResolveDir(get().vfs, path, get().cwd),
      readFile: (path) => vfsReadFile(get().vfs, path, get().cwd),
      listDir: (path) => vfsListDir(get().vfs, path, get().cwd),
      exists: (path) => vfsExists(get().vfs, path, get().cwd),
      absPath: (path) => resolvePath(get().cwd, path),
      stat: (path) => getNode(get().vfs, path, get().cwd),

      // ---- mutations ----------------------------------------------
      createDir: (path) => {
        const { vfs, cwd } = get()
        const r = vfsCreateDir(vfs, path, cwd)
        if (!r.ok) return { ok: false, error: r.error }
        set({ vfs: r.fs, version: get().version + 1 })
        return { ok: true, path: r.path }
      },

      createFile: (path, content = '') => {
        const { vfs, cwd } = get()
        const r = vfsWriteFile(vfs, path, content, cwd)
        if (!r.ok) return { ok: false, error: r.error }
        set({ vfs: r.fs, version: get().version + 1 })
        return { ok: true, path: r.path }
      },

      writeFile: (path, content) => {
        const { vfs, cwd } = get()
        const r = vfsWriteFile(vfs, path, content, cwd)
        if (!r.ok) return { ok: false, error: r.error }
        set({ vfs: r.fs, version: get().version + 1 })
        return { ok: true, path: r.path }
      },

      remove: (path) => {
        const { vfs, cwd } = get()
        const r = removeNode(vfs, path, cwd)
        if (!r.ok) return { ok: false, error: r.error }
        set({ vfs: r.fs, version: get().version + 1 })
        return { ok: true, path: r.path }
      },

      rename: (path, newName) => {
        const { vfs, cwd } = get()
        const node = getNode(vfs, path, cwd)
        if (!node) return { ok: false, error: `no such file or directory: ${path}` }
        const parentPath = node.parentId ? pathOf(vfs, node.parentId) : '/'
        const target = `${parentPath === '/' ? '' : parentPath}/${newName}`
        const r = moveNode(vfs, path, target, cwd)
        if (!r.ok) return { ok: false, error: r.error }
        set({ vfs: r.fs, version: get().version + 1 })
        return { ok: true, path: r.path }
      },

      move: (from, to) => {
        const { vfs, cwd } = get()
        const r = moveNode(vfs, from, to, cwd)
        if (!r.ok) return { ok: false, error: r.error }
        set({ vfs: r.fs, version: get().version + 1 })
        return { ok: true, path: r.path }
      },

      copy: (from, to) => {
        const { vfs, cwd } = get()
        const r = copyNode(vfs, from, to, cwd)
        if (!r.ok) return { ok: false, error: r.error }
        set({ vfs: r.fs, version: get().version + 1 })
        return { ok: true, path: r.path }
      },

      setCwd: (path) => {
        const { vfs, cwd } = get()
        const dir = vfsResolveDir(vfs, path, cwd)
        if (!dir) return { ok: false, error: `not a directory: ${path}` }
        const abs = pathOf(vfs, dir.id)
        set({ cwd: abs, version: get().version + 1 })
        return { ok: true, path: abs }
      },

      reset: () =>
        set({ vfs: createDefaultFS(), cwd: HOME, version: get().version + 1 }),

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'nexus:fs:v1',
      storage: createJSONStorage(() =>
        isBrowser() ? window.localStorage : (undefined as unknown as Storage)
      ),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
      partialize: (s) => ({ vfs: s.vfs, cwd: s.cwd }),
    }
  )
)

/** Manually rehydrate from localStorage (called from a client effect). */
export function rehydrateFs() {
  if (!isBrowser()) return
  useFsStore.persist.rehydrate()
}

/** Ensure a file node exists at `path` (creates parent dirs as needed). */
export function ensureFile(path: string, content = ''): boolean {
  const store = useFsStore.getState()
  const segs = resolvePath(store.cwd, path).split('/').filter(Boolean)
  if (segs.length === 0) return false
  // walk + mkdir parents
  let cur = '/'
  for (let i = 0; i < segs.length - 1; i++) {
    cur = `${cur === '/' ? '' : cur}/${segs[i]}`
    if (!useFsStore.getState().exists(cur)) {
      const r = useFsStore.getState().createDir(cur)
      if (!r.ok) return false
    }
  }
  const r = useFsStore.getState().writeFile(path, content)
  return r.ok
}

/** Re-export the pure VFS helpers for callers that need them. */
export { createDefaultFS, createNode, HOME }

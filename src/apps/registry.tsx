'use client'

// ============================================================
// NEXUS OS — App Registry
//
// Central Map<string, AppDef> with useSyncExternalStore reactivity.
// Apps register themselves on import (side-effect) via registerApp().
// The barrel `src/apps/index.ts` imports registry + every app module
// so registration happens once at boot.
//
// Reactivity: subscribe()/getSnapshot() back useSyncExternalStore.
// openApp() bridges to the window-store (title + geometry + singleton).
// ============================================================

import { useSyncExternalStore } from 'react'
import type {
  AppDef,
  AppCategory,
  AppId,
  WindowComponentProps,
} from '@/lib/os/types'
import { useWindowStore } from '@/stores/window-store'

export type { AppDef, AppCategory, AppId, WindowComponentProps }

// ----- internal store ------------------------------------------------

const apps = new Map<string, AppDef>()
const listeners = new Set<() => void>()

// Cached snapshot array (recomputed on every mutation). useSyncExternalStore
// requires getSnapshot to return a referentially-stable value when nothing
// has changed, so we keep this cache and only rebuild it on registerApp().
let snapshot: AppDef[] = []

function recomputeSnapshot(): void {
  snapshot = Array.from(apps.values())
}

function emit(): void {
  for (const fn of listeners) fn()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): AppDef[] {
  return snapshot
}

// ----- public API ----------------------------------------------------

/**
 * Register an app. Overwrites a previous registration with the same id.
 * Notifies all subscribers (including useApps() hooks).
 */
export function registerApp(app: AppDef): void {
  apps.set(app.id, app)
  recomputeSnapshot()
  emit()
}

/** Look up an app by id. */
export function getApp(id: string): AppDef | undefined {
  return apps.get(id)
}

/** Return a shallow array of all registered apps. */
export function listApps(): AppDef[] {
  return snapshot
}

/**
 * React hook returning the current array of registered apps.
 * Re-renders whenever registerApp() is called.
 */
export function useApps(): AppDef[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Open (or focus) an app window. Reads the AppDef for title + default
 * geometry + singleton behaviour, then delegates to window-store.
 *
 * For singleton apps: if a window for this appId already exists, it is
 * focused (and restored if minimized) instead of opening a new one.
 */
export function openApp(id: string): void {
  const app = apps.get(id)
  if (!app) return
  const ws = useWindowStore.getState()

  if (app.singleton) {
    const existing = ws.windows.find((w) => w.appId === app.id)
    if (existing) {
      if (existing.minimized) ws.restoreWindow(existing.id)
      else ws.focusWindow(existing.id)
      return
    }
  }

  ws.openWindow(app.id as AppId, {
    title: app.title ?? app.name,
    w: app.defaultSize.w,
    h: app.defaultSize.h,
  })
}

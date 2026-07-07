'use client'

// ============================================================
// NEXUS OS — Launch Parameters
//
// Per-window launch parameters. Lets one app (e.g. file-manager)
// pass arbitrary params to another app's window when opening it
// (e.g. a file path so the code-editor / notepad can auto-load it).
//
// Backed by an in-memory Map<windowId, params>. Reactive via a
// lightweight subscribe/emit hook for the useLaunchParams(windowId)
// React hook (useSyncExternalStore).
//
// Lifecycle helpers:
//   setLaunchParams(windowId, params)  — store params (e.g. before
//                                        calling openApp)
//   getLaunchParams(windowId)          — read without consuming
//   takeLaunchParams(windowId)         — read + clear (one-shot)
//   clearLaunchParams(windowId)        — drop without reading
// ============================================================

import { useSyncExternalStore } from 'react'

type Params = Readonly<Record<string, unknown>>

const EMPTY: Params = Object.freeze({}) as Params

const store = new Map<string, Params>()
const listeners = new Set<() => void>()

// Per-window snapshot cache so useSyncExternalStore detects "no
// change" without re-rendering. Cleared on every emit().
const snapshotCache = new Map<string, Params>()

function emit(): void {
  snapshotCache.clear()
  for (const fn of listeners) fn()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function snapshotFor(windowId: string): Params {
  const cur = store.get(windowId)
  if (!cur) return EMPTY
  const cached = snapshotCache.get(windowId)
  if (cached === cur) return cached
  snapshotCache.set(windowId, cur)
  return cur
}

/**
 * Store launch params for a window. Replaces any existing params for
 * the same windowId. Notifies subscribers.
 */
export function setLaunchParams(windowId: string, params: Params): void {
  store.set(windowId, { ...params })
  emit()
}

/**
 * Read params for a window without consuming them. Returns an empty
 * object if no params are set.
 */
export function getLaunchParams(windowId: string): Params {
  return store.get(windowId) ?? EMPTY
}

/**
 * Read and clear params for a window (one-shot semantics). Returns
 * an empty object if no params are set. Notifies subscribers.
 */
export function takeLaunchParams(windowId: string): Params {
  const v = store.get(windowId) ?? EMPTY
  if (store.delete(windowId)) emit()
  return v
}

/** Drop params for a window without reading them. */
export function clearLaunchParams(windowId: string): void {
  if (store.delete(windowId)) emit()
}

/**
 * React hook returning the live launch params for a window. Re-renders
 * whenever setLaunchParams / takeLaunchParams / clearLaunchParams is
 * called for this windowId.
 */
export function useLaunchParams(windowId: string): Params {
  return useSyncExternalStore(
    subscribe,
    () => snapshotFor(windowId),
    () => EMPTY
  )
}

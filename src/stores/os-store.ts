// ============================================================
// NEXUS OS — OS Phase Store
//
// Not persisted. Drives the boot → lock → desktop phase flow
// in src/app/page.tsx.
// ============================================================

import { create } from 'zustand'
import type { OSPhase } from '@/lib/os/types'

type OsState = {
  phase: OSPhase
  setPhase: (p: OSPhase) => void
  boot: () => void
  lock: () => void
  unlock: () => void
  reboot: () => void
  shutdown: () => void
}

export const useOsStore = create<OsState>((set) => ({
  phase: 'boot',
  setPhase: (phase) => set({ phase }),
  boot: () => set({ phase: 'boot' }),
  lock: () => set({ phase: 'lock' }),
  unlock: () => set({ phase: 'desktop' }),
  reboot: () => set({ phase: 'boot' }),
  shutdown: () => set({ phase: 'boot' }),
}))

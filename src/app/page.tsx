'use client'

// ============================================================
// NEXUS OS — Phase flow
//
// Root client component. Reads `phase` from os-store and renders
// BootScreen → LockScreen → Desktop. Also triggers rehydration of
// the persisted stores (settings + fs) on mount.
// ============================================================

import { useEffect } from 'react'
import { useOsStore } from '@/stores/os-store'
import { rehydrateSettings } from '@/stores/settings-store'
import { rehydrateFs } from '@/stores/fs-store'
import { BootScreen } from '@/components/os/boot-screen'
import { LockScreen } from '@/components/os/lock-screen'
import { Desktop } from '@/components/os/desktop'

export default function Home() {
  const phase = useOsStore((s) => s.phase)

  // Rehydrate persisted stores on the client. (ThemeApplier also calls
  // rehydrateSettings — calling it here too is harmless and keeps the
  // fs store in sync regardless of which component mounts first.)
  useEffect(() => {
    rehydrateSettings()
    rehydrateFs()
  }, [])

  if (phase === 'boot') return <BootScreen />
  if (phase === 'lock') return <LockScreen />
  return <Desktop />
}

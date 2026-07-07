'use client'

import { useEffect } from 'react'
import { useSettingsStore, rehydrateSettings } from '@/stores/settings-store'

/**
 * ThemeApplier
 *
 * Subscribes to the settings store and writes theme state to <html>:
 *   - data-theme          → swaps --phosphor + derived CSS vars
 *   - data-crt-quality    → 'static' | 'subtle' | 'full' (toggles CRT fx visibility)
 *   - --crt-scanline-opacity (0–1, scaled from the 0–100 scanlines setting)
 *   - html.crt-disabled   → fully hides CRT overlay when crt=false
 *
 * Renders nothing. Runs only on the client.
 */
export function ThemeApplier() {
  const theme = useSettingsStore((s) => s.theme)
  const crt = useSettingsStore((s) => s.crt)
  const crtQuality = useSettingsStore((s) => s.crtQuality)
  const scanlines = useSettingsStore((s) => s.scanlines)

  useEffect(() => {
    // rehydrate persisted settings on mount (skipHydration=true on store)
    rehydrateSettings()
  }, [])

  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = theme
    el.dataset.crtQuality = crtQuality
    // scale 0–100 → 0.0–0.5 opacity (keep scanlines subtle, never opaque)
    el.style.setProperty('--crt-scanline-opacity', (scanlines / 200).toFixed(3))
    el.classList.toggle('crt-disabled', !crt)
  }, [theme, crt, crtQuality, scanlines])

  return null
}

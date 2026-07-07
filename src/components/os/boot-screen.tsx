'use client'

// ============================================================
// NEXUS OS — Boot Screen
//
// Phosphor boot sequence. BAKED-IN scanlines (a self-contained
// overlay div) so the CRT aesthetic shows on first paint, without
// depending on CRTOverlay hydrating from the settings store.
//
// After ~4.5s — or any key / click — calls setPhase('lock').
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useOsStore } from '@/stores/os-store'

type BootLine = { text: string; delay: number }

const BOOT_LINES: BootLine[] = [
  { text: 'NEXUS OS v3.1 (Phosphor)', delay: 60 },
  { text: '[boot] mounting virtual fs ............ ok', delay: 120 },
  { text: '[boot] warming phosphor (green) ....... ok', delay: 140 },
  { text: '[boot] agent-runs store ............... mounted', delay: 110 },
  { text: '[boot] sentinel engine ................ ready', delay: 130 },
  { text: '[boot] nexus fusion ................... ready', delay: 130 },
  { text: '[boot] loading music library .......... ok', delay: 100 },
]

const NEXUS_ART = [
  '  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗',
  '  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝',
  '  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗',
  '  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║',
  '  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║',
  '  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
].join('\n')

export function BootScreen() {
  const setPhase = useOsStore((s) => s.setPhase)
  const [visibleLines, setVisibleLines] = useState<string[]>([])
  const [showArt, setShowArt] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const advancedRef = useRef(false)

  const advance = useCallback(() => {
    if (advancedRef.current) return
    advancedRef.current = true
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    setPhase('lock')
  }, [setPhase])

  useEffect(() => {
    let acc = 0
    BOOT_LINES.forEach((line) => {
      acc += line.delay
      const t = setTimeout(() => {
        setVisibleLines((prev) => [...prev, line.text])
      }, acc)
      timersRef.current.push(t)
    })
    const tArt = setTimeout(() => setShowArt(true), acc + 220)
    const tDone = setTimeout(() => setShowDone(true), acc + 700)
    // Auto-advance ~4.5s total (acc is ~790ms + 700 + buffer)
    const tAdvance = setTimeout(advance, 4500)
    timersRef.current.push(tArt, tDone, tAdvance)

    return () => {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
    }
  }, [advance])

  // Any key / click skips to lock screen.
  useEffect(() => {
    const skip = () => advance()
    window.addEventListener('keydown', skip)
    window.addEventListener('click', skip)
    window.addEventListener('touchstart', skip)
    return () => {
      window.removeEventListener('keydown', skip)
      window.removeEventListener('click', skip)
      window.removeEventListener('touchstart', skip)
    }
  }, [advance])

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at center, var(--background) 0%, var(--bg-deep) 100%)',
        color: 'var(--phosphor)',
        fontFamily: 'var(--font-display), ui-monospace, monospace',
      }}
      role="status"
      aria-live="polite"
      aria-label="NEXUS OS booting"
    >
      {/* Boot text */}
      <div className="relative z-10 h-full w-full overflow-y-auto p-6 sm:p-10">
        <pre
          className="whitespace-pre-wrap text-xs leading-tight sm:text-sm"
          style={{
            textShadow:
              '0 0 6px var(--phosphor-glow), 0 0 12px var(--phosphor-glow)',
          }}
        >
          {visibleLines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
          {showArt && (
            <div className="mt-4" style={{ color: 'var(--phosphor-bright)' }}>
              {NEXUS_ART}
            </div>
          )}
          {showDone && (
            <div
              className="mt-4"
              style={{ color: 'var(--phosphor-bright)' }}
            >
              boot complete — entering lock screen
            </div>
          )}
          <span className="term-spinner" aria-hidden />
        </pre>
      </div>

      {/* BAKED-IN scanlines + vignette — independent of CRTOverlay hydration */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.28) 3px, rgba(0,0,0,0.28) 4px), radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.75) 100%)',
        }}
      />
    </div>
  )
}

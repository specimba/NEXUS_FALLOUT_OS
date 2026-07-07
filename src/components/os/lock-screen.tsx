'use client'

// ============================================================
// NEXUS OS — Lock Screen
//
// Pip-Boy style lock. BAKED-IN scanlines so the CRT aesthetic is
// present from first paint (does not depend on CRTOverlay hydrating).
//
// Auth is visual-only: ANY non-empty access code unlocks. Hint shows
// "TRY 'nexus'". Enter or button → setPhase('desktop').
// ============================================================

import { useState, useSyncExternalStore } from 'react'
import { useOsStore } from '@/stores/os-store'

const NEXUS_WORDMARK = [
  '███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗',
  '████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝',
  '██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗',
  '██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║',
  '██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║',
  '╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
].join('\n')

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatDate(d: Date): string {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  const months = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ]
  return `${days[d.getDay()]} ${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// useSyncExternalStore clock — SSR-safe (server snapshot = 0 → null) and
// lint-clean (no synchronous setState inside an effect).
function subscribeClock(cb: () => void): () => void {
  const id = setInterval(cb, 1000)
  return () => clearInterval(id)
}

export function LockScreen() {
  const setPhase = useOsStore((s) => s.setPhase)
  const epochSec = useSyncExternalStore(
    subscribeClock,
    () => Math.floor(Date.now() / 1000),
    () => 0
  )
  const now = epochSec > 0 ? new Date(epochSec * 1000) : null
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  const unlock = () => {
    if (code.trim().length > 0) {
      setPhase('desktop')
      return
    }
    setError(true)
    setShake(true)
    setTimeout(() => setShake(false), 400)
  }

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at center, var(--background) 0%, var(--bg-deep) 100%)',
        color: 'var(--phosphor)',
        fontFamily: 'var(--font-display), ui-monospace, monospace',
      }}
      role="dialog"
      aria-label="NEXUS OS lock screen"
    >
      <div
        className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-6 px-4"
        style={{
          transform: shake ? 'translateX(0)' : undefined,
          animation: shake ? 'nexusShake 0.4s ease' : undefined,
        }}
      >
        {/* Wordmark */}
        <pre
          className="text-[9px] leading-tight sm:text-xs"
          style={{
            textShadow:
              '0 0 6px var(--phosphor-glow), 0 0 12px var(--phosphor-glow)',
            color: 'var(--phosphor-bright)',
          }}
          aria-label="NEXUS"
        >
          {NEXUS_WORDMARK}
        </pre>

        {/* Clock */}
        <div className="flex flex-col items-center gap-1">
          <div
            className="text-4xl tabular-nums sm:text-6xl"
            style={{
              textShadow:
                '0 0 8px var(--phosphor-glow), 0 0 16px var(--phosphor-glow)',
              color: 'var(--phosphor-bright)',
            }}
            aria-live="polite"
          >
            {now ? formatClock(now) : '--:--:--'}
          </div>
          <div className="text-[10px] uppercase tracking-[0.3em] opacity-70 sm:text-xs">
            {now ? formatDate(now) : '———— —— ——- ——––'}
          </div>
        </div>

        {/* Access code form */}
        <div className="w-full max-w-xs">
          <label
            htmlFor="nexus-access-code"
            className="mb-2 block text-center text-[10px] uppercase tracking-[0.4em] opacity-80"
          >
            Access Code
          </label>
          <input
            id="nexus-access-code"
            type="password"
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              if (error) setError(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') unlock()
            }}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="w-full border bg-transparent px-3 py-2 text-center text-sm tracking-[0.4em] outline-none"
            style={{
              borderColor: error ? 'var(--cyber-magenta)' : 'var(--border)',
              color: 'var(--phosphor-bright)',
              caretColor: 'var(--phosphor)',
              background: 'var(--bg-deep)',
            }}
            aria-label="Access code"
          />
          <button
            onClick={unlock}
            className="mt-3 w-full border px-3 py-2 text-xs uppercase tracking-[0.3em] transition hover:opacity-100"
            style={{
              borderColor: 'var(--phosphor-dim)',
              background: 'var(--card)',
              color: 'var(--phosphor-bright)',
              opacity: 0.9,
            }}
          >
            Authenticate
          </button>
          <div
            className="mt-3 text-center text-[10px] uppercase tracking-[0.3em]"
            style={{
              color: error ? 'var(--cyber-magenta)' : 'var(--phosphor-dim)',
            }}
          >
            {error ? 'ACCESS DENIED — code required' : "TRY 'nexus'"}
          </div>
        </div>
      </div>

      {/* ROBCO footer flavor */}
      <div className="absolute bottom-4 left-0 right-0 z-10 text-center text-[9px] uppercase tracking-[0.4em] opacity-50 sm:text-[10px]">
        ROBCO Industries (c) 2287 — Unified OS Platform
      </div>

      {/* BAKED-IN scanlines + vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.28) 3px, rgba(0,0,0,0.28) 4px), radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.75) 100%)',
        }}
      />

      <style>{`
        @keyframes nexusShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  )
}

'use client'

// ============================================================
// NEXUS OS — `less`-style pager overlay
//
// Full-screen pager for manuals / help text / file dumps.
// Phosphor styling on var(--background). Keyboard:
//   ↑/↓/j/k      line up / down
//   PgUp/PgDn    page up / down (also Space / b)
//   g / G        top / bottom (also Home / End)
//   /            search forward  (n / N to cycle)
//   q / Esc      close
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type LessViewerProps = {
  content: string
  onClose: () => void
  title?: string
}

const ROW_HEIGHT = 18 // px — matches fontSize 13 / lineHeight 18

export function LessViewer({ content, onClose, title = 'MANUAL' }: LessViewerProps) {
  const lines = useMemo(() => content.split('\n'), [content])
  const viewRef = useRef<HTMLDivElement | null>(null)
  const [top, setTop] = useState(0)
  const [visible, setVisible] = useState(40)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState<number | null>(null)
  const [matches, setMatches] = useState<number[]>([])

  // Measure viewport to compute visible rows.
  const measure = useCallback(() => {
    const el = viewRef.current
    if (!el) return
    const vis = Math.max(1, Math.floor(el.clientHeight / ROW_HEIGHT) - 2)
    setVisible(vis)
  }, [])

  useEffect(() => {
    measure()
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure])

  // Reset scroll on content change (adjusting-state-during-render
  // pattern — React-friendly alternative to setState-in-effect).
  const [prevContent, setPrevContent] = useState(content)
  if (prevContent !== content) {
    setPrevContent(content)
    setTop(0)
    setSearching(false)
    setQuery('')
    setMatches([])
    setMatchIdx(null)
  }

  const maxTop = Math.max(0, lines.length - visible)
  const clampTop = useCallback(
    (n: number) => Math.max(0, Math.min(maxTop, n)),
    [maxTop]
  )

  // Run a search across all lines.
  const runSearch = useCallback(
    (q: string) => {
      if (!q) {
        setMatches([])
        setMatchIdx(null)
        return
      }
      const low = q.toLowerCase()
      const hits: number[] = []
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(low)) hits.push(i)
      }
      setMatches(hits)
      if (hits.length > 0) {
        setMatchIdx(0)
        setTop(clampTop(hits[0]))
      } else {
        setMatchIdx(null)
      }
    },
    [lines, clampTop]
  )

  // Keyboard handler — installed at window level so keys are captured
  // even when the input element isn't focused.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Skip if a search input is being typed into — handled separately.
      if (searching) return

      const key = e.key

      if (key === 'q' || key === 'Q' || key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      // Begin a search.
      if (key === '/') {
        e.preventDefault()
        setSearching(true)
        setQuery('')
        return
      }

      // Cycle search matches.
      if (key === 'n' || key === 'N') {
        if (matches.length === 0) return
        e.preventDefault()
        const dir = e.shiftKey || key === 'N' ? -1 : 1
        setMatchIdx((prev) => {
          if (prev === null) return null
          const next = (prev + dir + matches.length) % matches.length
          setTop(clampTop(matches[next]))
          return next
        })
        return
      }

      // Movement keys.
      switch (key) {
        case 'ArrowDown':
        case 'e':
        case 'j':
          e.preventDefault()
          setTop((t) => clampTop(t + 1))
          return
        case 'ArrowUp':
        case 'y':
        case 'k':
          e.preventDefault()
          setTop((t) => clampTop(t - 1))
          return
        case ' ':
        case 'PageDown':
        case 'f':
          e.preventDefault()
          setTop((t) => clampTop(t + visible))
          return
        case 'PageUp':
        case 'b':
          e.preventDefault()
          setTop((t) => clampTop(t - visible))
          return
        case 'g':
        case 'Home':
          e.preventDefault()
          setTop(0)
          return
        case 'G':
        case 'End':
          e.preventDefault()
          setTop(maxTop)
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searching, matches, visible, maxTop, clampTop, onClose])

  // Search input handler (only active while searching).
  const onSearchInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      runSearch(query)
      setSearching(false)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setSearching(false)
      setQuery('')
      setMatches([])
      setMatchIdx(null)
      return
    }
    if (e.key === 'Backspace' && query === '') {
      setSearching(false)
      return
    }
  }

  const end = Math.min(lines.length, top + visible)
  const pct = lines.length <= visible ? 100 : Math.round((end / lines.length) * 100)

  // Highlight the matched line visually.
  const viewLines = lines.slice(top, end)
  const relMatch = matchIdx !== null ? matchIdx - top : -1

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col"
      style={{
        background: 'var(--background)',
        color: 'var(--phosphor)',
        fontFamily: 'var(--font-mono), ui-monospace, monospace',
        fontSize: 13,
        lineHeight: `${ROW_HEIGHT}px`,
      }}
      role="dialog"
      aria-label={title}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between border-b px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
        style={{
          borderColor: 'var(--border)',
          color: 'var(--phosphor-dim)',
        }}
      >
        <span>{title}</span>
        <span>
          {top + 1}–{end}/{lines.length} · {pct}%
        </span>
      </div>

      {/* Viewport */}
      <div
        ref={viewRef}
        className="flex-1 overflow-hidden px-3 py-2"
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          textShadow: '0 0 6px var(--phosphor-glow)',
        }}
      >
        {viewLines.map((ln, i) => (
          <div
            key={top + i}
            style={
              i === relMatch
                ? {
                    background: 'var(--phosphor)',
                    color: 'var(--background)',
                    textShadow: 'none',
                  }
                : undefined
            }
          >
            {ln || '\u00a0'}
          </div>
        ))}
      </div>

      {/* Footer / search bar */}
      {searching ? (
        <div
          className="flex shrink-0 items-center gap-2 border-t px-3 py-1"
          style={{ borderColor: 'var(--border)' }}
        >
          <span style={{ color: 'var(--phosphor-dim)' }}>/</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchInputKey}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent outline-none"
            style={{
              color: 'var(--phosphor)',
              fontFamily: 'var(--font-mono), ui-monospace, monospace',
              fontSize: 13,
            }}
            aria-label="search"
          />
          <span style={{ color: 'var(--phosphor-dim)' }}>↵ search · Esc cancel</span>
        </div>
      ) : (
        <div
          className="flex shrink-0 items-center justify-between border-t px-3 py-1 text-[11px]"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--phosphor-dim)',
          }}
        >
          <span>
            {pct >= 100 ? '(END)' : `(${pct}%)`}
            {matchIdx !== null && matches.length > 0
              ? `  ·  match ${matchIdx + 1}/${matches.length}`
              : ''}
          </span>
          <span>
            <span style={{ color: 'var(--phosphor)' }}>q</span>:quit ·{' '}
            <span style={{ color: 'var(--phosphor)' }}>↑/↓</span>:scroll ·{' '}
            <span style={{ color: 'var(--phosphor)' }}>space</span>:pgdn ·{' '}
            <span style={{ color: 'var(--phosphor)' }}>g/G</span>:top/bot ·{' '}
            <span style={{ color: 'var(--phosphor)' }}>/</span>:search
          </span>
        </div>
      )}
    </div>
  )
}

export default LessViewer

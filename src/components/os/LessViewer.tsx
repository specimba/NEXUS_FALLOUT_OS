'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModeProps } from '@/lib/os/types'

type Props = ModeProps & { text: string; title?: string }

/** A fullscreen `less`-style pager for man-page-style documents. */
export default function LessViewer({ theme, onExit, text, title = 'MANUAL' }: Props) {
  const lines = useMemo(() => text.split('\n'), [text])
  const [top, setTop] = useState(0)
  const viewRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(0)

  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const rowH = 19 // approx line height in px
    setVisible(Math.max(1, Math.floor(el.clientHeight / rowH) - 2))
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = viewRef.current
      const rowH = 19
      const vis = el ? Math.max(1, Math.floor(el.clientHeight / rowH) - 2) : visible
      switch (e.key) {
        case 'q':
        case 'Q':
        case 'Escape':
          e.preventDefault()
          onExit()
          break
        case 'ArrowDown':
        case 'e':
        case 'j':
          e.preventDefault()
          setTop((t) => Math.min(t + 1, Math.max(0, lines.length - vis)))
          break
        case 'ArrowUp':
        case 'y':
        case 'k':
          e.preventDefault()
          setTop((t) => Math.max(0, t - 1))
          break
        case ' ':
        case 'PageDown':
        case 'f':
          e.preventDefault()
          setTop((t) => Math.min(t + vis, Math.max(0, lines.length - vis)))
          break
        case 'PageUp':
        case 'b':
          e.preventDefault()
          setTop((t) => Math.max(0, t - vis))
          break
        case 'g':
        case 'Home':
          e.preventDefault()
          setTop(0)
          break
        case 'G':
        case 'End':
          e.preventDefault()
          setTop(Math.max(0, lines.length - vis))
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lines.length, onExit, visible])

  const end = Math.min(lines.length, top + visible)
  const pct = lines.length <= visible ? 100 : Math.round((end / lines.length) * 100)

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: theme.bg,
        color: theme.fg,
        fontFamily: 'var(--font-mono), monospace',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
      }}
    >
      <div style={{ color: theme.dim, borderBottom: `1px solid ${theme.dim}`, paddingBottom: 6, marginBottom: 8 }}>
        {title} — lines {top + 1}–{end}/{lines.length} ({pct}%)  ·  q:quit  ↑/↓:scroll  space:pgdn  g/G:top/bot
      </div>
      <div
        ref={viewRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: '19px',
          fontSize: 14,
          textShadow: `0 0 6px ${theme.glow}`,
        }}
      >
        {lines.slice(top, end).join('\n')}
      </div>
      <div style={{ color: theme.dim, borderTop: `1px solid ${theme.dim}`, paddingTop: 6, marginTop: 8 }}>
        {pct >= 100 ? '(END)' : `(${pct}%)`}  — press <span style={{ color: theme.fg }}>q</span> to return to shell
      </div>
    </div>
  )
}

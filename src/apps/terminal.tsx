'use client'

// ============================================================
// NEXUS OS — Terminal app
//
// Phosphor-green interactive shell. Output scrollback (max 1000
// lines), native <input> for editing (mobile-friendly), command
// history (Up/Down + Ctrl+R reverse search), Ctrl+L clear, Tab
// completion with ghost preview, sound feedback, less-pager overlay
// for help / `less <file>`, now-playing bar for chiptune music.
//
// CRITICAL: the window-level keydown listener GUARDS against
// INPUT/TEXTAREA/contentEditable targets so it never swallows
// typing in the Browser address bar (or any other input). All
// command-line editing is handled by the native <input>'s own
// onKeyDown; the window listener only refocuses the input on
// printable keys when the terminal window is the focused window.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TerminalSquare } from 'lucide-react'
import type {
  AppId,
  CommandContext,
  OutputLine,
  WindowComponentProps,
} from '@/lib/os/types'
import {
  COMMANDS,
  COMMAND_NAMES,
  computeGhostWithCtx,
  shortCwd,
  tokenize,
} from '@/lib/os/commands'
import { LessViewer } from '@/components/os/less-viewer'
import { useSettingsStore } from '@/stores/settings-store'
import { useFsStore } from '@/stores/fs-store'
import { useWindowStore } from '@/stores/window-store'
import { openApp } from '@/apps/registry'
import { registerApp } from '@/apps/registry'
import { MusicPlayerInstance, formatTime, type PlaybackState } from '@/lib/os/music'
import { playKeyClick, playBeep, setEnabled as setSoundEnabled } from '@/lib/os/sound'

const MAX_LINES = 1000
const HISTORY_KEY = 'nexus:history:v1'
const MAX_HISTORY = 200

type Line = OutputLine & { id: number }

const WELCOME: OutputLine[] = [
  { type: 'ascii', text: '╔═ NEXUS OS v5.0 — nexus-sh 1.0 ═══════════════════╗' },
  { type: 'dim', text: '║  Bio-Pip-Cyberpunk terminal · governance first  ║' },
  { type: 'ascii', text: '╚══════════════════════════════════════════════════╝' },
  { type: 'text', text: '' },
  { type: 'text', text: "Type 'help' for the manual. Quick start:" },
  { type: 'dim', text: '  status        system overview' },
  { type: 'dim', text: '  ls            list files' },
  { type: 'dim', text: '  cat <file>    print a file' },
  { type: 'dim', text: '  ask <q>       ask the NEXUS AI  (REAL /api/ai/ask)' },
  { type: 'dim', text: '  fetch <url>   fetch a URL      (REAL /api/browserless)' },
  { type: 'dim', text: '  play <id>     play chiptune music' },
  { type: 'text', text: '' },
  { type: 'dim', text: 'Governance first. Stay patched. — sysop' },
  { type: 'text', text: '' },
]

// =====================================================================
// TerminalApp
// =====================================================================

function TerminalApp({ windowId }: WindowComponentProps) {
  // --- stores (reactive) ---
  const username = useSettingsStore((s) => s.username)
  const theme = useSettingsStore((s) => s.theme)
  const crt = useSettingsStore((s) => s.crt)
  const sound = useSettingsStore((s) => s.sound)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setCrt = useSettingsStore((s) => s.setCrt)
  const setSound = useSettingsStore((s) => s.setSound)

  const cwd = useFsStore((s) => s.cwd)
  const fsVersion = useFsStore((s) => s.version) // re-render on fs mutations

  const focusedId = useWindowStore((s) => s.focusedId)
  const isFocused = focusedId === windowId

  // --- output scrollback ---
  const [lines, setLines] = useState<Line[]>([])
  const lineIdRef = useRef(0)
  const linesRef = useRef<Line[]>([])
  linesRef.current = lines

  const pushLines = useCallback((newLines: OutputLine[]) => {
    if (newLines.length === 0) return
    setLines((prev) => {
      const made: Line[] = newLines.map((l) => ({ ...l, id: lineIdRef.current++ }))
      const next = [...prev, ...made]
      // Cap scrollback at MAX_LINES (drop oldest).
      if (next.length > MAX_LINES) {
        return next.slice(next.length - MAX_LINES)
      }
      return next
    })
  }, [])

  const clearLines = useCallback(() => {
    setLines([])
  }, [])

  // --- input editing ---
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const inputValRef = useRef('')
  inputValRef.current = input

  // --- command history ---
  const [history, setHistory] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY)
      return raw ? (JSON.parse(raw) as string[]).slice(-MAX_HISTORY) : []
    } catch {
      return []
    }
  })
  const historyRef = useRef<string[]>(history)
  historyRef.current = history
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const histIdxRef = useRef<number | null>(null)
  histIdxRef.current = histIdx
  const stashRef = useRef('')

  // --- reverse search (Ctrl+R) ---
  const [searching, setSearching] = useState(false)
  const searchingRef = useRef(false)
  searchingRef.current = searching
  const [searchQuery, setSearchQuery] = useState('')
  const searchQueryRef = useRef('')
  searchQueryRef.current = searchQuery
  const [searchMatch, setSearchMatch] = useState<string | null>(null)
  const searchMatchIdxRef = useRef<number | null>(null)

  // --- busy / live / manual overlay ---
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [live, setLive] = useState(false)
  const liveRef = useRef(false)
  const stopFnRef = useRef<(() => void) | null>(null)
  const [manual, setManual] = useState<string | null>(null)

  // --- music playback ---
  const [playback, setPlayback] = useState<PlaybackState | null>(null)

  // --- sound refs (for ctx closures) ---
  const soundRef = useRef(sound)
  soundRef.current = sound

  // --- ghost completion ---
  const [ghost, setGhost] = useState('')
  const ghostRef = useRef('')

  // --- scroll handling ---
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef(true)
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }
  useEffect(() => {
    if (stickRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, busy, searching, input, playback])

  // ===================================================================
  // EFFECTS
  // ===================================================================

  // Welcome banner on mount (once).
  const bootedRef = useRef(false)
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    pushLines(WELCOME)
  }, [pushLines])

  // Sync sound synth to settings.
  useEffect(() => {
    setSoundEnabled(sound)
  }, [sound])

  // Subscribe to music player updates.
  useEffect(() => {
    MusicPlayerInstance.on(setPlayback)
    return () => MusicPlayerInstance.on(() => {})
  }, [])

  // Persist history.
  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)))
    } catch {
      /* quota */
    }
  }, [history])

  // ===================================================================
  // CTX BUILDER
  // ===================================================================

  const buildCtx = useCallback((): CommandContext => {
    const fs = useFsStore.getState()
    const st = useSettingsStore.getState()
    return {
      cwd: fs.cwd,
      setCwd: (p: string) => {
        useFsStore.getState().setCwd(p)
      },
      fs: fs.vfs,
      writeFile: (p, c) => {
        const r = useFsStore.getState().writeFile(p, c)
        return r.ok ? r.path : null
      },
      createDir: (p) => {
        const r = useFsStore.getState().createDir(p)
        return r.ok ? r.path : null
      },
      remove: (p) => useFsStore.getState().remove(p).ok,
      move: (f, t) => useFsStore.getState().move(f, t).ok,
      copy: (f, t) => useFsStore.getState().copy(f, t).ok,
      pushLine: (line) => {
        const arr = Array.isArray(line) ? line : [line]
        pushLines(arr)
        stickRef.current = true
      },
      clearLines: () => clearLines(),
      registerStop: (fn) => {
        stopFnRef.current = fn
      },
      theme: st.theme,
      setTheme: (t) => setTheme(t),
      crt: st.crt,
      setCrt: (v) => setCrt(v),
      sound: st.sound,
      setSound: (v) => setSound(v),
      username: st.username,
      openApp: (appId: AppId, opts) => openApp(appId, opts),
    }
  }, [pushLines, clearLines, setTheme, setCrt, setSound])

  // ===================================================================
  // EXECUTE
  // ===================================================================

  const execute = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim()
      // echo prompt line
      pushLines([
        { type: 'dim', text: `${username}@nexus:${shortCwd(cwd)}$ ${raw}` },
      ])
      stickRef.current = true
      if (!trimmed) return

      // history push
      setHistory((h) => {
        const nh = [...h, raw]
        historyRef.current = nh
        return nh
      })

      const tokens = tokenize(trimmed)
      const name = tokens[0]
      const args = tokens.slice(1)
      const def = COMMANDS[name]
      if (!def) {
        pushLines([{ type: 'error', text: `sh: ${name}: command not found — type 'help'` }])
        playBeep(180, 0.1, 0.08)
        return
      }

      const ctx = buildCtx()
      setBusy(true)
      busyRef.current = true
      stopFnRef.current = null
      try {
        const res = await def.run(args, ctx)
        if (res.clear) clearLines()
        if (res.openManual !== undefined) {
          setManual(res.openManual)
        }
        if (res.output !== undefined) {
          const arr = Array.isArray(res.output) ? res.output : [{ type: 'text' as const, text: res.output }]
          if (arr.length > 0) pushLines(arr)
        }
      } catch (e) {
        pushLines([{ type: 'error', text: `sh: ${name}: ${(e as Error).message}` }])
        playBeep(180, 0.1, 0.08)
      } finally {
        // Live commands (watch) stay busy until stop is called.
        if (!liveRef.current) {
          setBusy(false)
          busyRef.current = false
        }
      }
    },
    [buildCtx, clearLines, cwd, pushLines, username]
  )

  // ===================================================================
  // LIVE STOP
  // ===================================================================

  const stopLive = useCallback(() => {
    const fn = stopFnRef.current
    stopFnRef.current = null
    if (fn) {
      try {
        fn()
      } catch {
        /* ignore */
      }
    }
    liveRef.current = false
    setLive(false)
    setBusy(false)
    busyRef.current = false
  }, [])

  // ===================================================================
  // GHOST COMPLETION (recomputed on input/cwd/fs change)
  // ===================================================================

  useEffect(() => {
    if (searchingRef.current) {
      setGhost('')
      ghostRef.current = ''
      return
    }
    const { ghost: g } = computeGhostWithCtx(input, input.length, buildCtx())
    ghostRef.current = g
    setGhost(g)
  }, [input, cwd, fsVersion, buildCtx])

  // ===================================================================
  // INPUT onKeyDown  (all command-line editing)
  // ===================================================================

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // ---- reverse-search mode ----
      if (searchingRef.current) {
        const key = e.key
        if (e.ctrlKey && (key === 'r' || key === 'R')) {
          e.preventDefault()
          // cycle to next-older match
          const q = searchQueryRef.current.toLowerCase()
          const h = historyRef.current
          const start = searchMatchIdxRef.current === null ? h.length : searchMatchIdxRef.current
          for (let i = start - 1; i >= 0; i--) {
            if (h[i].toLowerCase().includes(q)) {
              searchMatchIdxRef.current = i
              setSearchMatch(h[i])
              return
            }
          }
          return
        }
        if (key === 'Enter') {
          e.preventDefault()
          const match = searchMatch
          setSearching(false)
          searchingRef.current = false
          setSearchQuery('')
          searchQueryRef.current = ''
          setSearchMatch(null)
          searchMatchIdxRef.current = null
          if (match) {
            setInput(match)
            inputValRef.current = match
            void execute(match)
            setInput('')
            inputValRef.current = ''
            setHistIdx(null)
            histIdxRef.current = null
          } else {
            const val = inputValRef.current
            setInput('')
            inputValRef.current = ''
            void execute(val)
          }
          return
        }
        if (key === 'Escape' || (e.ctrlKey && (key === 'g' || key === 'G' || key === 'c' || key === 'C'))) {
          e.preventDefault()
          setSearching(false)
          searchingRef.current = false
          setSearchQuery('')
          searchQueryRef.current = ''
          setSearchMatch(null)
          searchMatchIdxRef.current = null
          return
        }
        if (key === 'Backspace') {
          // let the input handle backspace naturally; recompute match
          const q = searchQueryRef.current.slice(0, -1)
          // the input's onChange will fire and update searchQuery state
          // but we also need to update the match now
          setTimeout(() => {
            const qq = searchQueryRef.current
            const h = historyRef.current
            let found: string | null = null
            let idx: number | null = null
            for (let i = h.length - 1; i >= 0; i--) {
              if (h[i].toLowerCase().includes(qq.toLowerCase())) {
                found = h[i]
                idx = i
                break
              }
            }
            setSearchMatch(found)
            searchMatchIdxRef.current = idx
          }, 0)
          return
        }
        // printable chars + Ctrl+R handled above; let onChange drive searchQuery
        return
      }

      // ---- NOT in reverse-search ----
      const key = e.key

      // Ctrl+R — enter reverse-search
      if (e.ctrlKey && (key === 'r' || key === 'R')) {
        e.preventDefault()
        setSearching(true)
        searchingRef.current = true
        stashRef.current = inputValRef.current
        setSearchQuery('')
        searchQueryRef.current = ''
        setSearchMatch(null)
        searchMatchIdxRef.current = null
        setInput('')
        inputValRef.current = ''
        return
      }

      // Ctrl+L — clear screen
      if (e.ctrlKey && (key === 'l' || key === 'L')) {
        e.preventDefault()
        clearLines()
        return
      }

      // Ctrl+C — cancel current line (or stop live)
      if (e.ctrlKey && (key === 'c' || key === 'C')) {
        const sel = window.getSelection()
        if (sel && sel.toString().length > 0) {
          return // let browser copy
        }
        e.preventDefault()
        if (liveRef.current) {
          stopLive()
          return
        }
        if (busyRef.current) return
        pushLines([
          { type: 'dim', text: `${username}@nexus:${shortCwd(cwd)}$ ${inputValRef.current}^C` },
        ])
        setInput('')
        inputValRef.current = ''
        setHistIdx(null)
        histIdxRef.current = null
        return
      }

      // Ctrl+V / Cmd+V — let the input paste natively (no preventDefault)

      // q / Escape stops a live command
      if (liveRef.current && (key === 'q' || key === 'Q' || key === 'Escape')) {
        e.preventDefault()
        stopLive()
        return
      }

      if (busyRef.current) {
        // swallow most keys while busy, except Ctrl+C (handled above)
        if (key !== 'Tab' && key !== 'F5') e.preventDefault()
        return
      }

      // Tab — completion
      if (key === 'Tab') {
        e.preventDefault()
        const val = inputValRef.current
        const { ghost: g, candidates } = computeGhostWithCtx(val, val.length, buildCtx())
        if (g) {
          const nv = val + g
          setInput(nv)
          inputValRef.current = nv
        } else if (candidates.length > 1) {
          pushLines([{ type: 'dim', text: candidates.join('   ') }])
        } else {
          playBeep(220, 0.05, 0.05)
        }
        return
      }

      // ArrowUp / ArrowDown — history navigation
      if (key === 'ArrowUp') {
        e.preventDefault()
        const h = historyRef.current
        if (h.length === 0) return
        let idx = histIdxRef.current
        if (idx === null) {
          stashRef.current = inputValRef.current
          idx = h.length
        }
        if (idx > 0) {
          idx -= 1
          setHistIdx(idx)
          histIdxRef.current = idx
          setInput(h[idx])
          inputValRef.current = h[idx]
        }
        return
      }
      if (key === 'ArrowDown') {
        e.preventDefault()
        const h = historyRef.current
        let idx = histIdxRef.current
        if (idx === null) return
        idx += 1
        if (idx >= h.length) {
          setHistIdx(null)
          histIdxRef.current = null
          setInput(stashRef.current)
          inputValRef.current = stashRef.current
        } else {
          setHistIdx(idx)
          histIdxRef.current = idx
          setInput(h[idx])
          inputValRef.current = h[idx]
        }
        return
      }

      // Enter — execute
      if (key === 'Enter') {
        e.preventDefault()
        const val = inputValRef.current
        setInput('')
        inputValRef.current = ''
        setHistIdx(null)
        histIdxRef.current = null
        stashRef.current = ''
        void execute(val)
        return
      }

      // Sound click for printable keys
      if (
        soundRef.current &&
        key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        playKeyClick()
      }
    },
    [buildCtx, clearLines, cwd, execute, pushLines, stopLive, username]
  )

  // ===================================================================
  // INPUT onChange — handles typing + reverse-search query
  // ===================================================================

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    if (searchingRef.current) {
      // typing in reverse-search builds the query + finds newest match
      setSearchQuery(v)
      searchQueryRef.current = v
      const h = historyRef.current
      let found: string | null = null
      let idx: number | null = null
      for (let i = h.length - 1; i >= 0; i--) {
        if (h[i].toLowerCase().includes(v.toLowerCase())) {
          found = h[i]
          idx = i
          break
        }
      }
      setSearchMatch(found)
      searchMatchIdxRef.current = idx
      return
    }
    setInput(v)
    inputValRef.current = v
  }, [])

  // ===================================================================
  // WINDOW-LEVEL KEYDOWN LISTENER
  //
  // CRITICAL: guards against INPUT / TEXTAREA / contentEditable
  // targets so it never swallows typing in the Browser address bar
  // (or any other input anywhere in the app). Its only job is to
  // refocus the terminal's own input when a key is pressed while
  // the terminal window is focused AND no input is currently
  // active. It also catches Ctrl+L globally to clear the screen.
  // ===================================================================

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ---- THE GUARD ----
      const t = e.target as EventTarget | null
      if (
        t &&
        typeof t === 'object' &&
        'tagName' in t &&
        (t as HTMLElement).tagName !== undefined
      ) {
        const el = t as HTMLElement
        if (
          el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable
        ) {
          return // never interfere with typing anywhere
        }
      }

      // Only act if our window is the focused one.
      if (!isFocusedRef.current) return

      // Ctrl+L global clear
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault()
        clearLines()
        inputRef.current?.focus()
        return
      }

      // Ctrl+R global reverse-search
      if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) {
        if (!searchingRef.current && !busyRef.current) {
          e.preventDefault()
          inputRef.current?.focus()
          // dispatch a synthetic Ctrl+R into the focused input
          // (the input's onKeyDown will handle the rest)
          inputRef.current?.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'r',
              ctrlKey: true,
              bubbles: true,
            })
          )
        }
        return
      }

      // For printable keys, refocus the input (the actual keystroke
      // is then typed into the input via the browser's normal path).
      if (
        !busyRef.current &&
        !searchingRef.current &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        // don't preventDefault — let the browser type into the
        // newly focused input. But focus first.
        if (document.activeElement !== inputRef.current) {
          inputRef.current?.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearLines])

  // ref mirror of isFocused for the window listener
  const isFocusedRef = useRef(isFocused)
  useEffect(() => {
    isFocusedRef.current = isFocused
  }, [isFocused])

  // Focus the input when this window becomes focused.
  useEffect(() => {
    if (isFocused) {
      // slight delay so the focus action doesn't fight the click
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [isFocused])

  // ===================================================================
  // RENDER
  // ===================================================================

  const promptStr = `${username}@nexus:${shortCwd(cwd)}`
  const nowPlaying = playback?.playing && playback.song ? playback.song : null

  const lineColor = (type: OutputLine['type']): string => {
    switch (type) {
      case 'error':
        return 'var(--cyber-magenta)'
      case 'success':
        return 'var(--phosphor-bright)'
      case 'dim':
        return 'var(--phosphor-dim)'
      case 'ascii':
        return 'var(--phosphor-bright)'
      default:
        return 'var(--phosphor)'
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--phosphor)',
    fontFamily: 'var(--font-mono), ui-monospace, monospace',
    fontSize: 13,
    lineHeight: '20px',
    flex: 1,
    minWidth: 0,
    caretColor: 'var(--phosphor-bright)',
  }

  const glow = { textShadow: '0 0 6px var(--phosphor-glow)' }

  const busyText = useMemo(() => {
    if (live) return '● LIVE — press q or Ctrl+C to stop'
    return 'working'
  }, [live])

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{
        background: 'var(--background)',
        color: 'var(--phosphor)',
        fontFamily: 'var(--font-mono), ui-monospace, monospace',
        fontSize: 13,
        lineHeight: '20px',
      }}
      role="region"
      aria-label="Terminal"
    >
      {/* SCROLLBACK */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="term-scroll flex-1 overflow-y-auto px-3 py-2"
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          scrollbarWidth: 'thin',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((l) => (
          <div
            key={l.id}
            style={{
              color: lineColor(l.type),
              ...glow,
              fontWeight: l.type === 'ascii' ? 600 : 400,
            }}
          >
            {l.text || '\u00a0'}
          </div>
        ))}

        {/* PROMPT ROW */}
        {!busy && !searching && (
          <div className="flex flex-wrap items-center" style={glow}>
            <span style={{ color: 'var(--phosphor-dim)' }} className="shrink-0">
              {promptStr}${' '}
            </span>
            <div className="relative flex-1" style={{ minWidth: 0 }}>
              {/* ghost text overlay */}
              {ghost && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    color: 'var(--phosphor-dim)',
                    opacity: 0.55,
                    pointerEvents: 'none',
                    whiteSpace: 'pre',
                    ...glow,
                  }}
                >
                  {input + ghost}
                </span>
              )}
              <input
                ref={inputRef}
                value={input}
                onChange={onInputChange}
                onKeyDown={onInputKeyDown}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="terminal input"
                style={{
                  ...inputStyle,
                  color: ghost ? 'transparent' : 'var(--phosphor)',
                  caretColor: 'var(--phosphor-bright)',
                  position: 'relative',
                  zIndex: 1,
                }}
              />
            </div>
          </div>
        )}

        {/* REVERSE-SEARCH PROMPT */}
        {!busy && searching && (
          <div className="flex flex-wrap items-center" style={glow}>
            <span style={{ color: 'var(--phosphor-dim)' }}>
              reverse-i-search ({searchQuery}):{' '}
            </span>
            <span style={{ color: searchMatch ? 'var(--phosphor-bright)' : 'var(--phosphor-dim)' }}>
              {searchMatch || '(no match)'}
            </span>
            <div className="ml-2 flex-1">
              <input
                ref={inputRef}
                value={searchQuery}
                onChange={onInputChange}
                onKeyDown={onInputKeyDown}
                spellCheck={false}
                autoComplete="off"
                aria-label="reverse search"
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {/* BUSY ROW */}
        {busy && (
          <div style={{ color: 'var(--phosphor-dim)', ...glow }}>
            <span style={{ color: 'var(--phosphor-dim)' }}>{promptStr}$ </span>
            <span style={{ color: live ? 'var(--phosphor-bright)' : 'var(--phosphor-dim)' }}>
              {busyText}
              {!live && <span className="term-spinner" />}
            </span>
          </div>
        )}
      </div>

      {/* NOW-PLAYING / STATUS BAR */}
      <div
        className="flex shrink-0 items-center gap-3 px-3 py-1 text-[11px]"
        style={{
          borderTop: nowPlaying ? '1px solid var(--border)' : 'none',
          color: 'var(--phosphor-dim)',
          minHeight: 22,
          ...glow,
        }}
      >
        {nowPlaying && playback ? (
          <PlayingBar playback={playback} />
        ) : (
          <span style={{ opacity: 0.7 }}>
            {crt ? 'crt:on' : 'crt:off'} · sound:{sound ? 'on' : 'off'} · theme:{theme} ·{' '}
            {COMMAND_NAMES.length} commands — type <span style={{ color: 'var(--phosphor)' }}>help</span>
          </span>
        )}
      </div>

      {/* LESS-PAGER OVERLAY */}
      {manual !== null && (
        <LessViewer content={manual} onClose={() => setManual(null)} title="NEXUS OS — MANUAL" />
      )}
    </div>
  )
}

// =====================================================================
// PlayingBar
// =====================================================================

function PlayingBar({ playback }: { playback: PlaybackState }) {
  const { song, elapsedSec, totalSec } = playback
  const pct = Math.min(1, Math.max(0, elapsedSec / totalSec))
  const bars = 16
  const filled = Math.round(pct * bars)
  const meter = Array.from({ length: bars })
    .map((_, i) => (i < filled ? '▮' : '▯'))
    .join('')
  return (
    <span className="flex w-full items-center gap-3">
      <span style={{ color: 'var(--phosphor-bright)' }}>♪</span>
      <span style={{ color: 'var(--phosphor)' }}>
        {song.title} <span style={{ color: 'var(--phosphor-dim)' }}>— {song.artist}</span>
      </span>
      <span style={{ color: 'var(--phosphor-dim)' }}>{meter}</span>
      <span style={{ color: 'var(--phosphor-dim)', marginLeft: 'auto' }}>
        {formatTime(elapsedSec)} / {formatTime(totalSec)}
      </span>
    </span>
  )
}

// =====================================================================
// REGISTER
// =====================================================================

registerApp({
  id: 'terminal',
  name: 'Terminal',
  icon: <TerminalSquare className="h-5 w-5" />,
  component: TerminalApp,
  defaultSize: { x: 120, y: 80, w: 720, h: 460 },
  minSize: { x: 0, y: 0, w: 360, h: 200 },
  singleton: true,
  pinned: true,
  category: 'system',
})

export default TerminalApp

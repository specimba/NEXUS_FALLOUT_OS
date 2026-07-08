'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TermLine, Theme, ThemeId } from '@/lib/os/types'
import { getTheme } from '@/lib/os/themes'
import { createVFS, resetVFS as resetVfsFactory, writeFile, type VFS } from '@/lib/os/vfs'
import { COMMANDS, COMMAND_NAMES, tokenize, type CommandContext } from '@/lib/os/commands'
import { player, formatTime, type PlaybackState } from '@/lib/os/music'
import { playKeyClick, playBeep, setSoundEnabled } from '@/lib/os/sound'
import AsciiPaint from './AsciiPaint'
import ChatClient from './ChatClient'
import LessViewer from './LessViewer'

type Mode = null | 'paint' | 'chat' | 'help'

const BOOT_LINES: { text: string; kind?: TermLine['kind']; delay: number }[] = [
  { text: 'NEXUS OS v3.1 (Phosphor)  —  booting fallout-shell...', kind: 'dim', delay: 0 },
  { text: '[boot] mounting virtual fs ............ ok', kind: 'dim', delay: 120 },
  { text: '[boot] warming phosphor (green) ....... ok', kind: 'dim', delay: 140 },
  { text: '[boot] brain api :7352 ................ LIVE', kind: 'success', delay: 160 },
  { text: '[boot] governor kaiju v2.4 ............ mounted', kind: 'dim', delay: 120 },
  { text: '[boot] vault 5-track memory ........... mounted', kind: 'dim', delay: 120 },
  { text: '[boot] swarm foreman ................. online', kind: 'dim', delay: 120 },
  { text: '[boot] model relay (GLM-5.2) ......... quota_aware', kind: 'dim', delay: 120 },
  { text: '[boot] loading music library (' + 5 + ' tracks) .... ok', kind: 'dim', delay: 100 },
  { text: '', delay: 60 },
  { text: '  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗   type `help` for the manual', kind: 'system', delay: 80 },
  { text: '  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝   type `status` for system overview', kind: 'system', delay: 30 },
  { text: '  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗   try `agents`, `swarm`, `vault`', kind: 'system', delay: 30 },
  { text: '  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║', kind: 'system', delay: 30 },
  { text: '  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║', kind: 'system', delay: 30 },
  { text: '  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝', kind: 'system', delay: 30 },
  { text: '', delay: 40 },
]

function shortCwd(cwd: string): string {
  if (cwd === '/home/nexus') return '~'
  if (cwd.startsWith('/home/nexus/')) return '~' + cwd.slice('/home/nexus'.length)
  return cwd || '/'
}

function longestCommonPrefix(arr: string[]): string {
  if (arr.length === 0) return ''
  let p = arr[0]
  for (let i = 1; i < arr.length; i++) {
    while (!arr[i].startsWith(p)) p = p.slice(0, -1)
    if (!p) break
  }
  return p
}

const PROMPT_USER = 'nexus@os'

export default function Terminal() {
  // --- persistent prefs ---
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    if (typeof window === 'undefined') return 'green'
    return (localStorage.getItem('cli-os-theme') as ThemeId) || 'green'
  })
  const [crtOn, setCrtOn] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('cli-os-crt') !== 'off'
  })
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('cli-os-sound') === 'on'
  })

  const theme: Theme = getTheme(themeId)

  // --- filesystem ---
  const vfsRef = useRef<VFS>(null as unknown as VFS)
  if (!vfsRef.current) vfsRef.current = createVFS()

  // --- terminal state ---
  const [lines, setLines] = useState<TermLine[]>([])
  const lineId = useRef(0)
  const pushLines = useCallback((newLines: { text: string; kind?: TermLine['kind'] }[]) => {
    setLines((prev) => {
      const made: TermLine[] = newLines.map((l) => ({ id: lineId.current++, text: l.text, kind: l.kind }))
      return [...prev, ...made]
    })
  }, [])

  const [cwd, _setCwd] = useState('/home/nexus')
  const cwdRef = useRef(cwd)
  const setCwd = (v: string) => {
    cwdRef.current = v
    _setCwd(v)
  }

  // --- input editing ---
  const [input, _setInput] = useState('')
  const inputRef = useRef('')
  const setInput = (v: string) => {
    inputRef.current = v
    _setInput(v)
  }
  const [cursor, _setCursor] = useState(0)
  const cursorRef = useRef(0)
  const setCursor = (v: number) => {
    cursorRef.current = v
    _setCursor(v)
  }

  const [history, _setHistory] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem('cli-os-history')
      return raw ? (JSON.parse(raw) as string[]).slice(-200) : []
    } catch {
      return []
    }
  })
  const historyRef = useRef<string[]>(history)
  useEffect(() => {
    historyRef.current = history
    try {
      window.localStorage.setItem('cli-os-history', JSON.stringify(history.slice(-200)))
    } catch {
      /* quota */
    }
  }, [history])
  const [histIdx, _setHistIdx] = useState<number | null>(null)
  const histIdxRef = useRef<number | null>(null)
  const setHistIdx = (v: number | null) => {
    histIdxRef.current = v
    _setHistIdx(v)
  }
  const stashRef = useRef('')

  // --- reverse search (Ctrl+R) ---
  const [searching, setSearching] = useState(false)
  const searchingRef = useRef(false)
  const [searchQuery, _setSearchQuery] = useState('')
  const searchQueryRef = useRef('')
  const setSearchQuery = (v: string) => {
    searchQueryRef.current = v
    _setSearchQuery(v)
  }
  const [searchMatch, setSearchMatch] = useState<string | null>(null)
  const searchMatchIdxRef = useRef<number | null>(null)

  // --- modes / busy ---
  const [mode, _setMode] = useState<Mode>(null)
  const modeRef = useRef<Mode>(null)
  const setMode = (m: Mode) => {
    modeRef.current = m
    _setMode(m)
  }
  const [manualText, setManualText] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [live, setLive] = useState(false)
  const liveRef = useRef(false)
  const liveStopRef = useRef<null | (() => void)>(null)

  // --- playback ---
  const [playback, setPlayback] = useState<PlaybackState | null>(null)
  useEffect(() => {
    player.on(setPlayback)
    return () => player.on(() => {})
  }, [])

  // --- theme fade ---
  const [fading, setFading] = useState(false)

  // --- sound sync ---
  useEffect(() => {
    setSoundEnabled(soundOn)
    localStorage.setItem('cli-os-sound', soundOn ? 'on' : 'off')
  }, [soundOn])

  // --- ghost completion ---
  const [ghost, setGhost] = useState('')
  const ghostRef = useRef('')

  const computeGhost = useCallback((val: string, cur: number): { ghost: string; candidates: string[] } => {
    if (cur !== val.length) return { ghost: '', candidates: [] }
    const endsSpace = /\s$/.test(val) || val === ''
    const tokens = tokenize(val)
    let candidates: string[] = []
    let prefix = ''
    if (tokens.length === 0 || (tokens.length === 1 && !endsSpace)) {
      prefix = tokens[0] || ''
      candidates = COMMAND_NAMES.filter((c) => c.startsWith(prefix))
    } else {
      const cmd = tokens[0]
      const def = COMMANDS[cmd]
      if (!def?.complete) return { ghost: '', candidates: [] }
      const args = tokens.slice(1)
      let argIndex: number
      if (endsSpace) {
        argIndex = args.length
        prefix = ''
      } else {
        argIndex = args.length - 1
        prefix = args[argIndex] || ''
      }
      const ctx = buildCtx()
      candidates = def.complete(args, argIndex, ctx).filter((c) => c.startsWith(prefix))
    }
    if (candidates.length === 0) return { ghost: '', candidates: [] }
    const common = longestCommonPrefix(candidates)
    let ext = common.slice(prefix.length)
    if (candidates.length === 1) {
      // add trailing space for files / commands, keep slash for dirs
      if (!ext.endsWith('/')) ext += ' '
    }
    return { ghost: ext, candidates }
  }, [])

  useEffect(() => {
    const { ghost: g } = computeGhost(input, cursor)
    ghostRef.current = g
    setGhost(g)
  }, [input, cursor, computeGhost])

  // --- command context ---
  const buildCtx = useCallback((): CommandContext => {
    return {
      vfs: vfsRef.current,
      cwd: cwdRef.current,
      setCwd,
      setTheme: changeTheme,
      toggleCrt: () => setCrtOn((v) => !v),
      setCrt: (v) => setCrtOn(v),
      isCrtOn: () => crtOnRef.current,
      setSound: (v) => setSoundOn(v),
      isSoundOn: () => soundOnRef.current,
      openMode: (m) => setMode(m),
      playSong: (s) => player.play(s),
      stopSong: () => player.stop(),
      isPlaying: () => player.isPlaying(),
      nowPlaying: () => player.currentSong(),
      clear: () => setLines([]),
      history: () => historyRef.current,
      resetVfs: () => {
        vfsRef.current = resetVfsFactory()
        setCwd('/home/nexus')
      },
      pushLine: (line) => {
        pushLines([line])
        stickRef.current = true
      },
      registerStop: (fn) => {
        liveStopRef.current = fn
      },
    }
  }, [pushLines])

  // refs mirroring prefs for ctx closures
  const crtOnRef = useRef(crtOn)
  useEffect(() => {
    crtOnRef.current = crtOn
    localStorage.setItem('cli-os-crt', crtOn ? 'on' : 'off')
  }, [crtOn])
  const soundOnRef = useRef(soundOn)
  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])

  function changeTheme(id: ThemeId) {
    if (id === themeIdRef.current) return
    setFading(true)
    window.setTimeout(() => {
      setThemeId(id)
      localStorage.setItem('cli-os-theme', id)
    }, 100)
    window.setTimeout(() => setFading(false), 200)
  }
  const themeIdRef = useRef(themeId)
  useEffect(() => {
    themeIdRef.current = themeId
  }, [themeId])

  // --- scroll handling ---
  const scrollRef = useRef<HTMLDivElement>(null)
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
  }, [lines, playback])

  // --- boot sequence ---
  const bootedRef = useRef(false)
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    let acc = 0
    for (const l of BOOT_LINES) {
      acc += l.delay
      window.setTimeout(() => pushLines([{ text: l.text, kind: l.kind }]), acc)
    }
  }, [pushLines])

  // --- saveFile for modes ---
  const saveFile = useCallback((filename: string, content: string): string => {
    const res = writeFile(vfsRef.current, filename, cwdRef.current, content)
    return res.ok ? res.path : filename
  }, [])

  // --- command execution ---
  const execute = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim()
      // echo
      pushLines([{ text: `${PROMPT_USER}:${shortCwd(cwdRef.current)}$ ${raw}`, kind: 'input' }])
      if (!trimmed) return
      // history
      _setHistory((h) => {
        const nh = [...h, raw]
        historyRef.current = nh
        return nh
      })
      setHistIdx(null)
      const tokens = tokenize(trimmed)
      const name = tokens[0]
      const args = tokens.slice(1)
      const def = COMMANDS[name]
      if (!def) {
        pushLines([{ text: `sh: ${name}: command not found — type 'help'`, kind: 'error' }])
        playBeep(180, 0.1, 0.08)
        return
      }
      const ctx = buildCtx()
      try {
        setBusy(true)
        busyRef.current = true
        liveStopRef.current = null
        const res = await def.run(args, ctx)
        if (res.openManual) {
          setManualText(res.openManual)
          setMode('help')
        }
        if (res.lines.length) pushLines(res.lines)
        if (res.live) {
          // command runs in the background pushing lines; stay busy until stop
          liveRef.current = true
          setLive(true)
        } else {
          liveStopRef.current = null
        }
      } catch (e) {
        pushLines([{ text: `sh: ${name}: ${(e as Error).message}`, kind: 'error' }])
        playBeep(180, 0.1, 0.08)
      } finally {
        if (!liveRef.current) {
          setBusy(false)
          busyRef.current = false
        }
      }
    },
    [buildCtx, pushLines]
  )

  // --- stop the current live command (q / Ctrl+C while live) ---
  const stopLive = useCallback(() => {
    const fn = liveStopRef.current
    liveStopRef.current = null
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

  // --- key handling (shell only) ---
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (modeRef.current !== null) return
      const key = e.key

      // Ctrl+R — reverse history search
      if (e.ctrlKey && (key === 'r' || key === 'R')) {
        e.preventDefault()
        if (!searchingRef.current) {
          searchingRef.current = true
          setSearching(true)
          stashRef.current = inputRef.current
          setSearchQuery('')
          setSearchMatch(null)
          searchMatchIdxRef.current = null
        } else {
          // cycle to the next-older match
          const q = searchQueryRef.current
          const h = historyRef.current
          const start = searchMatchIdxRef.current === null ? h.length : searchMatchIdxRef.current
          for (let i = start - 1; i >= 0; i--) {
            if (h[i].toLowerCase().includes(q.toLowerCase())) {
              searchMatchIdxRef.current = i
              setSearchMatch(h[i])
              break
            }
          }
        }
        return
      }

      // while in reverse-search mode
      if (searchingRef.current) {
        if (key === 'Enter') {
          e.preventDefault()
          const match = searchMatch
          searchingRef.current = false
          setSearching(false)
          setSearchQuery('')
          setSearchMatch(null)
          searchMatchIdxRef.current = null
          if (match) {
            setInput(match)
            setCursor(match.length)
            void execute(match)
            setInput('')
            setCursor(0)
            setHistIdx(null)
          } else {
            const val = inputRef.current
            setInput('')
            setCursor(0)
            void execute(val)
          }
          return
        }
        if (key === 'Escape' || (e.ctrlKey && (key === 'g' || key === 'G' || key === 'c' || key === 'C'))) {
          e.preventDefault()
          searchingRef.current = false
          setSearching(false)
          setSearchQuery('')
          setSearchMatch(null)
          searchMatchIdxRef.current = null
          return
        }
        if (key === 'Backspace') {
          e.preventDefault()
          const q = searchQueryRef.current.slice(0, -1)
          setSearchQuery(q)
          // re-search from newest
          const h = historyRef.current
          let found: string | null = null
          let idx: number | null = null
          for (let i = h.length - 1; i >= 0; i--) {
            if (h[i].toLowerCase().includes(q.toLowerCase())) {
              found = h[i]
              idx = i
              break
            }
          }
          setSearchMatch(found)
          searchMatchIdxRef.current = idx
          return
        }
        if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          const q = searchQueryRef.current + key
          setSearchQuery(q)
          const h = historyRef.current
          let found: string | null = null
          let idx: number | null = null
          for (let i = h.length - 1; i >= 0; i--) {
            if (h[i].toLowerCase().includes(q.toLowerCase())) {
              found = h[i]
              idx = i
              break
            }
          }
          setSearchMatch(found)
          searchMatchIdxRef.current = idx
          return
        }
        return // ignore other keys in search mode
      }

      // Ctrl+L clears screen
      if (e.ctrlKey && (key === 'l' || key === 'L')) {
        e.preventDefault()
        setLines([])
        return
      }
      // Ctrl+C: if text is selected, let browser copy. Otherwise cancel.
      if (e.ctrlKey && (key === 'c' || key === 'C')) {
        const sel = window.getSelection()
        if (sel && sel.toString().length > 0) {
          return // let browser handle copy
        }
        e.preventDefault()
        if (liveRef.current) { stopLive(); return }
        if (busyRef.current) return
        pushLines([{ text: `${PROMPT_USER}:${shortCwd(cwdRef.current)}$ ${inputRef.current}^C`, kind: 'input' }])
        setInput(''); setCursor(0); setHistIdx(null)
        return
      }
      // Ctrl+V / Cmd+V: paste from clipboard
      if ((e.ctrlKey || e.metaKey) && (key === 'v' || key === 'V')) {
        e.preventDefault()
        if (busyRef.current || liveRef.current) return
        navigator.clipboard?.readText().then((text) => {
          if (!text) return
          const paste = text.replace(/\r?\n/g, ' ').replace(/\t/g, '  ')
          const cur = cursorRef.current
          const val = inputRef.current
          const nv = val.slice(0, cur) + paste + val.slice(cur)
          setInput(nv)
          setCursor(cur + paste.length)
          if (soundOnRef.current) playKeyClick()
        }).catch(() => {})
        return
      }

      // q stops a live command (tail/top)
      if (liveRef.current && (key === 'q' || key === 'Q' || key === 'Escape')) {
        e.preventDefault()
        stopLive()
        return
      }

      if (busyRef.current) return

      // Tab completion
      if (key === 'Tab') {
        e.preventDefault()
        const cur = cursorRef.current
        const val = inputRef.current
        const { ghost: g, candidates } = computeGhost(val, cur)
        if (g) {
          const nv = val + g
          setInput(nv)
          setCursor(nv.length)
        } else if (candidates.length > 1) {
          pushLines([{ text: candidates.join('   '), kind: 'dim' }])
        } else {
          playBeep(220, 0.05, 0.05)
        }
        return
      }

      if (key === 'Enter') {
        e.preventDefault()
        const val = inputRef.current
        setInput('')
        setCursor(0)
        setHistIdx(null)
        stashRef.current = ''
        void execute(val)
        return
      }

      if (key === 'Backspace') {
        e.preventDefault()
        const cur = cursorRef.current
        const val = inputRef.current
        if (cur === 0) return
        const nv = val.slice(0, cur - 1) + val.slice(cur)
        setInput(nv)
        setCursor(cur - 1)
        if (soundOnRef.current) playKeyClick()
        return
      }

      if (key === 'Delete') {
        e.preventDefault()
        const cur = cursorRef.current
        const val = inputRef.current
        if (cur >= val.length) return
        const nv = val.slice(0, cur) + val.slice(cur + 1)
        setInput(nv)
        return
      }

      if (key === 'ArrowLeft') {
        e.preventDefault()
        setCursor(Math.max(0, cursorRef.current - 1))
        return
      }
      if (key === 'ArrowRight') {
        e.preventDefault()
        setCursor(Math.min(inputRef.current.length, cursorRef.current + 1))
        return
      }
      if (key === 'Home') {
        e.preventDefault()
        setCursor(0)
        return
      }
      if (key === 'End') {
        e.preventDefault()
        setCursor(inputRef.current.length)
        return
      }

      if (key === 'ArrowUp') {
        e.preventDefault()
        const h = historyRef.current
        if (h.length === 0) return
        let idx = histIdxRef.current
        if (idx === null) {
          stashRef.current = inputRef.current
          idx = h.length
        }
        if (idx > 0) {
          idx -= 1
          setHistIdx(idx)
          setInput(h[idx])
          setCursor(h[idx].length)
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
          setInput(stashRef.current)
          setCursor(stashRef.current.length)
        } else {
          setHistIdx(idx)
          setInput(h[idx])
          setCursor(h[idx].length)
        }
        return
      }

      // printable
      if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        const cur = cursorRef.current
        const val = inputRef.current
        const nv = val.slice(0, cur) + key + val.slice(cur)
        setInput(nv)
        setCursor(cur + 1)
        if (soundOnRef.current) playKeyClick()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [computeGhost, execute, pushLines, stopLive])

  // --- mode exit handler ---
  const onModeExit = useCallback(
    (output?: string[]) => {
      setMode(null)
      if (output && output.length) {
        pushLines(output.map((text) => ({ text, kind: 'dim' as const })))
      }
      stickRef.current = true
    },
    [pushLines]
  )

  const promptStr = `${PROMPT_USER}:${shortCwd(cwd)}$`

  const charAtCursor = input[cursor] || ''

  const nowPlaying = playback?.playing && playback.song ? playback.song : null

  const lineColor = (kind?: TermLine['kind']) => {
    switch (kind) {
      case 'dim':
      case 'system':
        return theme.dim
      case 'error':
        return theme.fg
      case 'success':
        return theme.fg
      case 'input':
        return theme.fg
      default:
        return theme.fg
    }
  }

  const rootStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: theme.bg,
    color: theme.fg,
    fontFamily: 'var(--font-mono), ui-monospace, monospace',
    fontSize: 15,
    lineHeight: '20px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'text',
    WebkitUserSelect: 'text',
  }

  const glow = { textShadow: `0 0 6px ${theme.glow}` }

  return (
    <div style={rootStyle}>
      {/* scrollback */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px 4px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          scrollbarWidth: 'thin',
        }}
        className="term-scroll"
      >
        {lines.map((l) => (
          <div
            key={l.id}
            style={{
              color: lineColor(l.kind),
              ...glow,
              fontWeight: l.kind === 'system' ? 600 : 400,
            }}
          >
            {l.text || '\u00a0'}
          </div>
        ))}

        {/* live prompt line at bottom of scrollback */}
        {!busy && mode === null && !searching && (
          <div style={{ display: 'flex', flexWrap: 'wrap', ...glow }}>
            <span style={{ color: theme.dim }}>{promptStr} </span>
            <span style={{ color: theme.fg, whiteSpace: 'pre-wrap' }}>
              {input.slice(0, cursor)}
              <Cursor char={charAtCursor} theme={theme} />
              {input.slice(cursor)}
              {cursor === input.length && ghost ? (
                <span style={{ color: theme.dim, opacity: 0.6 }}>{ghost}</span>
              ) : null}
            </span>
          </div>
        )}
        {/* reverse-search prompt (Ctrl+R) */}
        {!busy && mode === null && searching && (
          <div style={{ display: 'flex', flexWrap: 'wrap', ...glow }}>
            <span style={{ color: theme.dim }}>reverse-i-search ({searchQuery}): </span>
            <span style={{ color: searchMatch ? theme.fg : theme.dim }}>
              {searchMatch || '(no match)'}
            </span>
          </div>
        )}
        {busy && (
          <div style={{ color: theme.dim, ...glow }}>
            <span style={{ color: theme.dim }}>{promptStr} </span>
            <span style={{ color: live ? theme.fg : theme.dim }}>
              {live ? '● LIVE — press q or Ctrl+C to stop' : 'working'}
              {!live && <span className="term-spinner" />}
            </span>
          </div>
        )}
      </div>

      {/* now playing bar */}
      <div
        style={{
          flexShrink: 0,
          padding: '4px 16px',
          borderTop: nowPlaying ? `1px solid ${theme.dim}` : 'none',
          color: theme.dim,
          minHeight: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          ...glow,
        }}
      >
        {nowPlaying ? (
          <PlayingBar playback={playback!} theme={theme} />
        ) : (
          <span style={{ opacity: 0.5 }}>
            brain 7352 LIVE  ·  GLM-5.2  ·  {crtOn ? 'crt:on' : 'crt:off'}  ·  sound:{soundOn ? 'on' : 'off'}  ·  theme:{themeId}  —  type `help`
          </span>
        )}
      </div>

      {/* CRT overlay */}
      {crtOn && <CrtOverlay theme={theme} />}

      {/* theme fade overlay */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000',
          opacity: fading ? 1 : 0,
          transition: 'opacity 100ms linear',
          pointerEvents: 'none',
          zIndex: 60,
        }}
      />

      {/* mode overlays */}
      {mode === 'paint' && <AsciiPaint theme={theme} onExit={onModeExit} saveFile={saveFile} />}
      {mode === 'chat' && <ChatClient theme={theme} onExit={onModeExit} saveFile={saveFile} />}
      {mode === 'help' && (
        <LessViewer theme={theme} onExit={() => onModeExit()} text={manualText} title="TERMINAL/OS — USER MANUAL" />
      )}
    </div>
  )
}

function Cursor({ char, theme }: { char: string; theme: Theme }) {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const id = window.setInterval(() => setOn((v) => !v), 1060)
    return () => window.clearInterval(id)
  }, [])
  return (
    <span
      style={
        on
          ? { background: theme.fg, color: theme.bg, borderRadius: 0 }
          : { background: 'transparent', color: theme.fg }
      }
    >
      {char || '\u00a0'}
    </span>
  )
}

function PlayingBar({ playback, theme }: { playback: PlaybackState; theme: Theme }) {
  const { song, elapsedSec, totalSec } = playback
  const pct = Math.min(1, Math.max(0, elapsedSec / totalSec))
  const bars = 16
  const filled = Math.round(pct * bars)
  const meter = Array.from({ length: bars })
    .map((_, i) => (i < filled ? '▮' : '▯'))
    .join('')
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
      <span style={{ color: theme.fg }}>♪</span>
      <span style={{ color: theme.fg }}>
        {song.title} <span style={{ color: theme.dim }}>— {song.artist}</span>
      </span>
      <span style={{ color: theme.dim, fontFamily: 'var(--font-mono), monospace' }}>{meter}</span>
      <span style={{ color: theme.dim, marginLeft: 'auto' }}>
        {formatTime(elapsedSec)} / {formatTime(totalSec)}
      </span>
    </span>
  )
}

function CrtOverlay({ theme }: { theme: Theme }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
      {/* scanlines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.28) 3px, rgba(0,0,0,0.28) 4px)',
          mixBlendMode: 'multiply',
        }}
      />
      {/* vertical mask + vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)',
        }}
      />
      {/* slow flicker */}
      <div
        className="crt-flicker"
        style={{
          position: 'absolute',
          inset: 0,
          background: theme.fg,
          opacity: 0.02,
        }}
      />
      {/* moving scan beam */}
      <div className="crt-beam" style={{ position: 'absolute', left: 0, right: 0, height: 120 }} />
    </div>
  )
}

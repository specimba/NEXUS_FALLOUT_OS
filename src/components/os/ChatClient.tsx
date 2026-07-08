'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, KeyboardEvent } from 'react'
import type { ModeProps } from '@/lib/os/types'

// ---------------------------------------------------------------------------
// Fictional chat client — simulated messages, no network.
// Mounted fullscreen by the terminal when the user types `chat`.
// ---------------------------------------------------------------------------

type ContactId = 'nex' | 'vex' | 'mira' | 'orc'

interface Contact {
  id: ContactId
  handle: string
  replies: string[]
}

interface Message {
  id: number
  from: 'you' | ContactId
  text: string
  ts: string
  /** dim system/meta line (saved, etc.) — rendered without a handle */
  sys?: boolean
}

interface Thread {
  messages: Message[]
  unread: number
  typing: boolean
}

const CONTACTS: Contact[] = [
  { id: 'nex', handle: 'nex', replies: ['k.', 'on it.', 'lol', "the uplink's noisy tonight", 'send me the dump', 'roger that'] },
  { id: 'vex', handle: 'vex', replies: ["they're watching the packets", 'tunnel through 7 proxies', 'trust no endpoint', 'i told you about the backdoor', 'stay frosty'] },
  { id: 'mira', handle: 'mira', replies: ['hey :) ', 'got the manifest', 'be careful out there', "coffee's on me", 'talk soon'] },
  { id: 'orc', handle: 'orc', replies: ['/usr sector clean', 'daemon restarted', 'logs rotated', 'uptime 412 days', 'ack'] },
]

const CONTACT_MAP: Record<ContactId, Contact> = Object.fromEntries(
  CONTACTS.map((c) => [c.id, c]),
) as Record<ContactId, Contact>

const ORDER: ContactId[] = ['nex', 'vex', 'mira', 'orc']

const MONO =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

const SEED: Record<ContactId, { from: ContactId; text: string }[]> = {
  nex: [{ from: 'nex', text: "you're late." }],
  vex: [{ from: 'vex', text: 'changed the keys yet?' }],
  mira: [{ from: 'mira', text: 'hey :) ' }],
  orc: [{ from: 'orc', text: 'uptime 412 days' }],
}

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

function nowTs(): string {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function buildInitialThreads(): Record<ContactId, Thread> {
  const t = {} as Record<ContactId, Thread>
  let i = 1
  ORDER.forEach((id) => {
    t[id] = {
      messages: SEED[id].map((m) => ({
        id: i++,
        from: m.from,
        text: m.text,
        ts: nowTs(),
      })),
      unread: id === 'nex' ? 0 : id === 'vex' ? 2 : id === 'mira' ? 1 : 0,
      typing: false,
    }
  })
  return t
}

export default function ChatClient(props: ModeProps) {
  const { theme, onExit } = props

  const [activeId, setActiveId] = useState<ContactId>('nex')
  const [threads, setThreads] = useState<Record<ContactId, Thread>>(buildInitialThreads)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState<number>(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const convoRef = useRef<HTMLDivElement>(null)
  const timersRef = useRef<number[]>([])
  const idCounter = useRef<number>(100)
  const lastReplyIdx = useRef<Record<ContactId, number>>({
    nex: -1,
    vex: -1,
    mira: -1,
    orc: -1,
  })
  const activeIdRef = useRef<ContactId>('nex')
  const threadsRef = useRef<Record<ContactId, Thread>>(threads)
  const mountedRef = useRef<boolean>(true)

  // keep refs in sync so async timers read fresh values
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])
  useEffect(() => {
    threadsRef.current = threads
  }, [threads])
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  function nextId(): number {
    idCounter.current += 1
    return idCounter.current
  }

  function pushMessage(id: ContactId, from: 'you' | ContactId, text: string, sys = false): void {
    setThreads((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        messages: [
          ...prev[id].messages,
          { id: nextId(), from, text, ts: nowTs(), sys },
        ],
      },
    }))
  }

  function setTyping(id: ContactId, typing: boolean): void {
    setThreads((prev) => ({ ...prev, [id]: { ...prev[id], typing } }))
  }

  function bumpUnread(id: ContactId): void {
    if (activeIdRef.current === id) return
    setThreads((prev) => ({ ...prev, [id]: { ...prev[id], unread: prev[id].unread + 1 } }))
  }

  function pickReply(id: ContactId): string {
    const pool = CONTACT_MAP[id].replies
    let idx = lastReplyIdx.current[id]
    let next = idx
    if (pool.length > 1) {
      while (next === idx) next = rand(0, pool.length - 1)
    } else {
      next = 0
    }
    lastReplyIdx.current[id] = next
    return pool[next]
  }

  function switchTo(id: ContactId): void {
    setActiveId(id)
    activeIdRef.current = id
    setThreads((prev) => ({ ...prev, [id]: { ...prev[id], unread: 0 } }))
    setHistIdx(-1)
    inputRef.current?.focus()
  }

  function sendMessage(text: string): void {
    const target = activeIdRef.current
    pushMessage(target, 'you', text)
    setHistory((h) => [...h, text])
    setHistIdx(-1)
    setTyping(target, true)
    const replyDelay = rand(600, 1600)
    const t = window.setTimeout(() => {
      if (!mountedRef.current) return
      setTyping(target, false)
      pushMessage(target, target, pickReply(target))
      if (activeIdRef.current !== target) bumpUnread(target)
    }, replyDelay)
    timersRef.current.push(t)
  }

  function saveActive(): void {
    const target = activeIdRef.current
    if (!props.saveFile) {
      pushMessage(target, target, '[save] not available', true)
      return
    }
    const t = threadsRef.current[target]
    const dump = t.messages
      .map((m) => `[${m.ts}] ${m.from} > ${m.text}`)
      .join('\n')
    const path = props.saveFile('chatlog.txt', `// chatlog — ${target}\n${dump}\n`)
    pushMessage(target, target, `[saved] ${path}`, true)
  }

  function quit(): void {
    const lines = ['[chat] session ended']
    for (const c of CONTACTS) {
      const t = threadsRef.current[c.id]
      lines.push(`conversation with ${c.handle}: ${t.messages.length} messages`)
    }
    onExit(lines)
  }

  // ---- mount: focus + start the "alive" unsolicited-message timer --------
  useEffect(() => {
    inputRef.current?.focus()

    let cancelled = false
    const schedule = (): void => {
      const t = window.setTimeout(
        () => {
          if (cancelled || !mountedRef.current) return
          const c = CONTACTS[rand(0, CONTACTS.length - 1)]
          setTyping(c.id, true)
          const t2 = window.setTimeout(
            () => {
              if (cancelled || !mountedRef.current) return
              setTyping(c.id, false)
              pushMessage(c.id, c.id, pickReply(c.id))
              if (activeIdRef.current !== c.id) bumpUnread(c.id)
            },
            rand(500, 1200),
          )
          timersRef.current.push(t2)
          schedule()
        },
        rand(4000, 9000),
      )
      timersRef.current.push(t)
    }
    schedule()

    return () => {
      cancelled = true
      timersRef.current.forEach((id) => clearTimeout(id))
      timersRef.current = []
    }
  }, [])

  // ---- auto-scroll conversation to bottom on new content -----------------
  const active = threads[activeId]
  useEffect(() => {
    const el = convoRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [activeId, active.messages.length, active.typing])

  // ---- keyboard -----------------------------------------------------------
  function onChange(e: ChangeEvent<HTMLInputElement>): void {
    setInput(e.target.value)
    if (histIdx !== -1) setHistIdx(-1)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    const key = e.key

    // quit
    if (key === 'Escape' || (e.ctrlKey && (key === 'c' || key === 'C'))) {
      e.preventDefault()
      quit()
      return
    }

    // Tab — cycle to next contact
    if (key === 'Tab') {
      e.preventDefault()
      const idx = ORDER.indexOf(activeIdRef.current)
      switchTo(ORDER[(idx + 1) % ORDER.length])
      return
    }

    // 1–4 — jump to a specific contact (only when the input is empty so we
    // don't eat digits the user is actually typing)
    if (input === '' && (key === '1' || key === '2' || key === '3' || key === '4')) {
      const idx = Number(key) - 1
      const target = ORDER[idx]
      if (target) switchTo(target)
      return
    }

    // history recall
    if (key === 'ArrowUp') {
      if (history.length === 0) return
      e.preventDefault()
      const ni = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1)
      setHistIdx(ni)
      setInput(history[ni] ?? '')
      return
    }
    if (key === 'ArrowDown') {
      if (histIdx < 0) return
      e.preventDefault()
      const ni = histIdx + 1
      if (ni >= history.length) {
        setHistIdx(-1)
        setInput('')
      } else {
        setHistIdx(ni)
        setInput(history[ni] ?? '')
      }
      return
    }

    if (key === 'Enter') {
      e.preventDefault()
      const raw = input
      if (raw === ':q' || raw === ':quit' || raw === ':exit') {
        quit()
        return
      }
      if (raw === ':s' || raw === ':save') {
        saveActive()
        setInput('')
        return
      }
      const text = raw.trim()
      if (text === '') return
      sendMessage(text)
      setInput('')
      return
    }
  }

  // ---- styles -------------------------------------------------------------
  const glow = { textShadow: `0 0 6px ${theme.glow}` }

  const sidebarBtn = (isActive: boolean): CSSProperties => ({
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    background: isActive ? theme.fg : 'transparent',
    color: isActive ? theme.bg : theme.fg,
    border: 'none',
    cursor: 'pointer',
    fontFamily: MONO,
    fontSize: 13,
    textAlign: 'left',
    textShadow: isActive ? 'none' : `0 0 6px ${theme.glow}`,
  })

  return (
    <div
      role="application"
      aria-label="chat client"
      onClick={() => inputRef.current?.focus()}
      style={{
        position: 'absolute',
        inset: 0,
        background: theme.bg,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: MONO,
        fontSize: 14,
        lineHeight: 1.4,
        color: theme.fg,
        ...glow,
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes chatBlink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
        .chat-cursor { display: inline-block; animation: chatBlink 1s steps(1, end) infinite; }
        .chat-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background: ${theme.dim}; }
        .chat-scroll { scrollbar-color: ${theme.dim} transparent; }
      `}</style>

      {/* top: sidebar + conversation */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* sidebar */}
        <aside
          className="chat-scroll"
          style={{
            width: 184,
            borderRight: `1px solid ${theme.dim}`,
            padding: '6px 0',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          <div style={{ padding: '2px 8px 6px', color: theme.dim, fontSize: 12 }}>
            {'// contacts'}
          </div>
          {CONTACTS.map((c) => {
            const t = threads[c.id]
            const isActive = c.id === activeId
            const fg = isActive ? theme.bg : theme.fg
            const dim = isActive ? theme.bg : theme.dim
            return (
              <button
                key={c.id}
                type="button"
                aria-label={`switch to ${c.handle}`}
                aria-pressed={isActive}
                onClick={(e) => {
                  e.stopPropagation()
                  switchTo(c.id)
                }}
                style={sidebarBtn(isActive)}
              >
                <span style={{ color: fg, width: 8 }}>{isActive ? '>' : ' '}</span>
                <span style={{ color: fg }}>●</span>
                <span style={{ flex: 1, color: fg }}>{c.handle}</span>
                <span style={{ color: dim }}>{t.unread > 0 ? `(${t.unread})` : ''}</span>
              </button>
            )
          })}
          <div
            style={{
              padding: '10px 8px 4px',
              color: theme.dim,
              fontSize: 11,
              lineHeight: 1.6,
              marginTop: 8,
              borderTop: `1px solid ${theme.dim}`,
            }}
          >
            tab / 1-4 switch
            <br />
            enter send
            <br />
            :q quit · :s save
            <br />
            ↑ history
          </div>
        </aside>

        {/* main pane */}
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div
            style={{
              padding: '4px 8px',
              borderBottom: `1px solid ${theme.dim}`,
              color: theme.dim,
              fontSize: 12,
              display: 'flex',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <span>
              {activeId} — online
            </span>
            <span>{active.messages.length} msgs</span>
          </div>

          <div
            ref={convoRef}
            className="chat-scroll"
            style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}
          >
            {active.messages.map((m) =>
              m.sys ? (
                <div
                  key={m.id}
                  style={{
                    color: theme.dim,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.text}
                </div>
              ) : (
                <div
                  key={m.id}
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  <span style={{ color: theme.dim }}>[{m.ts}] </span>
                  <span style={{ color: theme.fg }}>{m.from} &gt; </span>
                  <span style={{ color: theme.fg }}>{m.text}</span>
                </div>
              ),
            )}
            {active.typing && (
              <div style={{ color: theme.dim, fontStyle: 'italic' }}>
                {activeId} is typing…
              </div>
            )}
          </div>
        </section>
      </div>

      {/* bottom: input line */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          padding: '6px 8px',
          borderTop: `1px solid ${theme.dim}`,
          minHeight: 28,
          flexShrink: 0,
        }}
      >
        <span style={{ color: theme.dim, whiteSpace: 'pre' }}>&gt; </span>
        <span
          style={{
            color: theme.fg,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            ...glow,
          }}
        >
          {input}
        </span>
        <span className="chat-cursor" style={{ color: theme.fg, ...glow }}>
          █
        </span>
        <input
          ref={inputRef}
          value={input}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (mountedRef.current) {
              window.setTimeout(() => inputRef.current?.focus(), 0)
            }
          }}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="chat input"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'transparent',
            caretColor: 'transparent',
            fontFamily: MONO,
            fontSize: 14,
            padding: '6px 8px',
          }}
        />
      </div>
    </div>
  )
}

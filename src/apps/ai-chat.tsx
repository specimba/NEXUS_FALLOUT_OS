'use client'

// ============================================================
// NEXUS OS — AI Chat app
//
// ChatGPT-style multi-provider chat with SSE streaming, a searchable
// model picker (cmdk + Popover) grouped by provider, markdown
// rendering for assistant messages, auto-grow textarea with
// AbortController-based stop, and localStorage persistence.
//
// Registers itself on import via registerApp(). The orchestrator
// (src/apps/index.ts) appends `import './ai-chat'` to wire it in.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Send,
  Square,
  Plus,
  Settings as SettingsIcon,
  ChevronDown,
  Check,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { registerApp } from '@/apps/registry'
import type { AppId, WindowComponentProps } from '@/lib/os/types'
import type { ChatMessage, ModelOption } from '@/lib/nexus/types'
import { streamChat, fetchModels, type ModelsResponse } from '@/lib/os/ai-stream'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'

// ----- constants ------------------------------------------------------

const STORAGE_KEY = 'nexus:ai-chat:v1'

const PROVIDER_LABELS: Record<string, string> = {
  zai: 'Z.ai (GLM)',
  openai: 'OpenAI',
  groq: 'Groq (LPU)',
  cerebras: 'Cerebras',
  openrouter: 'OpenRouter',
  mistral: 'Mistral AI',
  novita: 'Novita AI',
  nvidia: 'NVIDIA NIM',
  qwen: 'Qwen (DashScope)',
  opencodezen: 'OpenCode Zen',
  kilocode: 'Kilo Code',
}

const ASCII_LOGO = `███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗
████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝
██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗
██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║
██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║
╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝`

const SUGGESTED = [
  'Explain quantum entanglement like I am five.',
  'Write a haiku about neon cyberpunk cities.',
  'Debug: my fetch() returns 401 — what do I check?',
  'Compare REST vs GraphQL with concrete examples.',
]

const BLINK_CSS = `@keyframes nexusCursorBlink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }`

// ----- types ----------------------------------------------------------

type Msg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  model?: string
  error?: boolean
}

interface PersistedState {
  messages: Msg[]
  model: string
  systemPrompt: string
  temperature: number
}

// ----- helpers --------------------------------------------------------

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Composite searchable string for a model — drives the picker filter. */
function modelSearchText(m: ModelOption): string {
  return [
    m.id,
    m.label,
    m.provider,
    PROVIDER_LABELS[m.provider] ?? m.provider,
    m.tier,
    m.isFree ? 'free' : 'paid',
    m.description,
  ]
    .join(' ')
    .toLowerCase()
}

// ============================================================
// App component
// ============================================================

export function AiChatApp(_props: WindowComponentProps) {
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [streaming, setStreaming] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)

  // ----- load models on mount ----------------------------------------
  useEffect(() => {
    let cancelled = false
    setModelsLoading(true)
    fetchModels()
      .then((r: ModelsResponse) => {
        if (cancelled) return
        setModels(r.models)
        setModel((prev) => {
          if (prev && r.models.some((m) => m.id === prev && m.available)) return prev
          const def = r.models.find((m) => m.id === r.default)
          return def?.available ? r.default : (r.models.find((m) => m.available)?.id ?? r.default)
        })
      })
      .catch(() => {
        /* surfaced via empty picker */
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ----- load persisted state on mount -------------------------------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<PersistedState>
      if (Array.isArray(parsed.messages)) {
        setMessages(parsed.messages.filter((m) => m && typeof m.content === 'string'))
      }
      if (typeof parsed.model === 'string' && parsed.model) setModel(parsed.model)
      if (typeof parsed.systemPrompt === 'string') setSystemPrompt(parsed.systemPrompt)
      if (typeof parsed.temperature === 'number') setTemperature(parsed.temperature)
    } catch {
      /* ignore corrupt storage */
    }
  }, [])

  // ----- persist on change -------------------------------------------
  useEffect(() => {
    try {
      const state: PersistedState = { messages, model, systemPrompt, temperature }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* quota / private mode — ignore */
    }
  }, [messages, model, systemPrompt, temperature])

  // ----- auto-grow textarea ------------------------------------------
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`
  }, [input])

  // ----- auto-scroll to bottom on new tokens -------------------------
  useEffect(() => {
    if (!stickToBottomRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  // ----- send / stream -----------------------------------------------
  async function send(overrideText?: string): Promise<void> {
    const text = (overrideText ?? input).trim()
    if (!text || streaming) return
    if (!model) return

    const userMsg: Msg = { id: newId(), role: 'user', content: text }
    const assistantMsg: Msg = { id: newId(), role: 'assistant', content: '', model }
    const history: ChatMessage[] = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }))

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)
    stickToBottomRef.current = true

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat({
        messages: history,
        model,
        systemPrompt: systemPrompt.trim() || undefined,
        temperature,
        signal: controller.signal,
        onToken: (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m,
            ),
          )
        },
        onError: (msg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: `${m.content}\n\n[error: ${msg}]`.trimStart(), error: true }
                : m,
            ),
          )
        },
      })
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : String(err)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `${m.content}\n\n[error: ${msg}]`.trimStart(), error: true }
              : m,
          ),
        )
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      // Drop an empty assistant bubble if nothing streamed.
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant' && !last.content.trim()) {
          return prev.slice(0, -1)
        }
        return prev
      })
    }
  }

  function stop(): void {
    abortRef.current?.abort()
  }

  function newChat(): void {
    if (streaming) stop()
    setMessages([])
    setInput('')
    stickToBottomRef.current = true
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  // ----- derived ------------------------------------------------------
  const currentModel = models.find((m) => m.id === model)

  const byProvider = useMemo(() => {
    const map = new Map<string, ModelOption[]>()
    for (const m of models) {
      const arr = map.get(m.provider) ?? []
      arr.push(m)
      map.set(m.provider, arr)
    }
    // Stable display order: zai first, then alphabetical by provider label.
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === 'zai') return -1
      if (b[0] === 'zai') return 1
      const la = PROVIDER_LABELS[a[0]] ?? a[0]
      const lb = PROVIDER_LABELS[b[0]] ?? b[0]
      return la.localeCompare(lb)
    })
  }, [models])

  const isEmpty = messages.length === 0

  // ============================================================
  // Render
  // ============================================================
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ background: 'var(--bg-deep)', color: 'var(--phosphor)' }}
    >
      <style>{BLINK_CSS}</style>

      {/* ---------- Header ---------- */}
      <div
        className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* Model picker (searchable combobox) */}
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 border px-2 py-1 text-xs transition hover:opacity-90"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
                color: 'var(--phosphor-bright)',
                borderRadius: 'var(--radius)',
              }}
              aria-label="Select model"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  background: currentModel?.available
                    ? 'var(--phosphor)'
                    : 'var(--phosphor-dim)',
                  boxShadow: currentModel?.available ? '0 0 6px var(--phosphor-glow)' : 'none',
                }}
                aria-hidden
              />
              <span className="max-w-[150px] truncate sm:max-w-[200px]">
                {currentModel
                  ? currentModel.label
                  : modelsLoading
                    ? 'loading models…'
                    : 'select model'}
              </span>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[340px] p-0"
            align="start"
            style={{
              background: 'var(--card)',
              borderColor: 'var(--border)',
              color: 'var(--phosphor)',
              borderRadius: 'var(--radius)',
            }}
          >
            <Command
              filter={(value, search) =>
                value.includes(search.toLowerCase()) ? 1 : 0
              }
            >
              <CommandInput placeholder="Search: free, nvidia, glm, groq…" />
              <CommandList className="max-h-[320px]">
                <CommandEmpty>No models match.</CommandEmpty>
                {byProvider.map(([providerId, providerModels]) => (
                  <CommandGroup
                    key={providerId}
                    heading={PROVIDER_LABELS[providerId] ?? providerId}
                  >
                    {providerModels.map((m) => (
                      <CommandItem
                        key={m.id}
                        value={modelSearchText(m)}
                        disabled={!m.available}
                        onSelect={() => {
                          setModel(m.id)
                          setPickerOpen(false)
                        }}
                        className="gap-2"
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{
                            background: m.available
                              ? 'var(--phosphor)'
                              : 'var(--phosphor-dim)',
                            boxShadow: m.available ? '0 0 5px var(--phosphor-glow)' : 'none',
                          }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="truncate text-xs"
                              style={{
                                color: m.available
                                  ? 'var(--phosphor-bright)'
                                  : 'var(--phosphor-dim)',
                              }}
                            >
                              {m.label}
                            </span>
                            {m.isFree && (
                              <Badge
                                variant="outline"
                                className="px-1 py-0 text-[9px] font-bold uppercase"
                                style={{
                                  borderColor: 'var(--phosphor-dim)',
                                  color: 'var(--phosphor)',
                                }}
                              >
                                free
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className="px-1 py-0 text-[9px] uppercase"
                              style={{
                                borderColor: 'var(--border)',
                                color: 'var(--phosphor-dim)',
                              }}
                            >
                              {m.tier}
                            </Badge>
                          </div>
                          <div
                            className="truncate text-[10px] opacity-60"
                            style={{ color: 'var(--phosphor-dim)' }}
                          >
                            {m.description}
                          </div>
                        </div>
                        {m.id === model && (
                          <Check className="size-3 shrink-0" aria-hidden />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={newChat}
            className="h-7 gap-1 px-2 text-xs"
            title="New conversation"
            style={{ color: 'var(--phosphor)' }}
          >
            <Plus className="size-3.5" />
            New
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSettingsOpen(true)}
            className="h-7 px-2"
            title="Settings"
            aria-label="Settings"
            style={{ color: 'var(--phosphor)' }}
          >
            <SettingsIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* ---------- Messages ---------- */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 nexus-chat-scroll"
      >
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-4 text-center">
            <pre
              className="leading-tight"
              style={{
                color: 'var(--phosphor-bright)',
                textShadow: '0 0 8px var(--phosphor-glow)',
                fontFamily: 'var(--font-mono), ui-monospace, monospace',
                fontSize: '8px',
              }}
            >
              {ASCII_LOGO}
            </pre>
            <div
              className="text-[10px] uppercase tracking-[0.3em] opacity-60"
              style={{ color: 'var(--phosphor-dim)' }}
            >
              AI Chat · Multi-Provider LLM
            </div>
            <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="border p-2 text-left text-[11px] transition hover:opacity-90"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--card)',
                    color: 'var(--phosphor)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                m={m}
                showCursor={
                  streaming && i === messages.length - 1 && m.role === 'assistant'
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* ---------- Input ---------- */}
      <div
        className="shrink-0 border-t p-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message NEXUS AI…  (Enter to send, Shift+Enter for newline)"
            aria-label="Message input"
            className="min-h-[36px] flex-1 resize-none border p-2 text-xs outline-none"
            style={{
              background: 'var(--card)',
              borderColor: 'var(--border)',
              color: 'var(--phosphor-bright)',
              fontFamily: 'var(--font-mono), ui-monospace, monospace',
              borderRadius: 'var(--radius)',
              maxHeight: 180,
            }}
          />
          {streaming ? (
            <Button
              size="sm"
              onClick={stop}
              className="h-9 gap-1 px-3"
              title="Stop generation"
              style={{
                background: 'var(--cyber-magenta)',
                color: '#000',
                borderRadius: 'var(--radius)',
              }}
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => void send()}
              disabled={!input.trim() || !model}
              className="h-9 gap-1 px-3"
              title="Send"
              style={{
                background: 'var(--phosphor)',
                color: 'var(--bg-deep)',
                borderRadius: 'var(--radius)',
              }}
            >
              <Send className="size-3.5" />
              Send
            </Button>
          )}
        </div>
      </div>

      {/* ---------- Settings dialog ---------- */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          style={{
            background: 'var(--card)',
            borderColor: 'var(--border)',
            color: 'var(--phosphor)',
            borderRadius: 'var(--radius)',
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--phosphor-bright)' }}>
              Chat Settings
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[10px] uppercase tracking-widest opacity-70"
                style={{ color: 'var(--phosphor-dim)' }}
              >
                System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                placeholder="You are a helpful assistant…"
                className="resize-none border p-2 text-xs outline-none"
                style={{
                  background: 'var(--bg-deep)',
                  borderColor: 'var(--border)',
                  color: 'var(--phosphor-bright)',
                  fontFamily: 'var(--font-mono), ui-monospace, monospace',
                  borderRadius: 'var(--radius)',
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                className="text-[10px] uppercase tracking-widest opacity-70"
                style={{ color: 'var(--phosphor-dim)' }}
              >
                Temperature: {temperature.toFixed(2)}
              </label>
              <Slider
                value={[temperature]}
                min={0}
                max={2}
                step={0.05}
                onValueChange={(v) => setTemperature(v[0] ?? 0.7)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setSettingsOpen(false)}
              style={{
                background: 'var(--phosphor)',
                color: 'var(--bg-deep)',
                borderRadius: 'var(--radius)',
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// Message bubble
// ============================================================

function MessageBubble({ m, showCursor }: { m: Msg; showCursor: boolean }) {
  const isUser = m.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] whitespace-pre-wrap break-words border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--cyber-cyan)',
            background: 'rgba(5,217,232,0.06)',
            color: 'var(--cyber-cyan)',
            borderRadius: 'var(--radius)',
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
          }}
        >
          {m.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[90%] border px-3 py-2 text-xs"
        style={{
          borderColor: m.error ? 'var(--cyber-magenta)' : 'var(--border)',
          background: 'var(--card)',
          color: m.error ? 'var(--cyber-magenta)' : 'var(--phosphor-bright)',
          borderRadius: 'var(--radius)',
        }}
      >
        <div className="nexus-md break-words">
          {m.content ? (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                pre: ({ children }) => (
                  <pre
                    className="my-2 overflow-x-auto border p-2"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--bg-deep)',
                      borderRadius: 'var(--radius)',
                      fontFamily: 'var(--font-mono), ui-monospace, monospace',
                    }}
                  >
                    {children}
                  </pre>
                ),
                code: ({ className, children }) => {
                  const isBlock =
                    typeof className === 'string' && className.includes('language-')
                  if (isBlock) {
                    return (
                      <code className={className} style={{ fontFamily: 'var(--font-mono), ui-monospace, monospace' }}>
                        {children}
                      </code>
                    )
                  }
                  return (
                    <code
                      className="px-1"
                      style={{
                        background: 'var(--bg-deep)',
                        color: 'var(--pip-amber)',
                        borderRadius: 'var(--radius)',
                        fontFamily: 'var(--font-mono), ui-monospace, monospace',
                      }}
                    >
                      {children}
                    </code>
                  )
                },
                ul: ({ children }) => (
                  <ul className="my-1 list-disc pl-4">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-1 list-decimal pl-4">{children}</ol>
                ),
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                    style={{ color: 'var(--cyber-cyan)' }}
                  >
                    {children}
                  </a>
                ),
                h1: ({ children }) => (
                  <h1 className="my-2 text-sm font-bold">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="my-2 text-sm font-bold">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="my-1.5 text-xs font-bold uppercase">{children}</h3>
                ),
                blockquote: ({ children }) => (
                  <blockquote
                    className="my-1 border-l-2 pl-2 italic opacity-80"
                    style={{ borderColor: 'var(--phosphor-dim)' }}
                  >
                    {children}
                  </blockquote>
                ),
                table: ({ children }) => (
                  <table
                    className="my-2 border text-[10px]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {children}
                  </table>
                ),
                th: ({ children }) => (
                  <th
                    className="border px-1.5 py-0.5 font-bold"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-deep)' }}
                  >
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border px-1.5 py-0.5" style={{ borderColor: 'var(--border)' }}>
                    {children}
                  </td>
                ),
              }}
            >
              {m.content}
            </ReactMarkdown>
          ) : null}
          {showCursor && (
            <span
              className="ml-0.5 inline-block"
              style={{
                color: 'var(--phosphor)',
                animation: 'nexusCursorBlink 1s steps(2) infinite',
              }}
              aria-hidden
            >
              █
            </span>
          )}
        </div>
        {m.model && (
          <div
            className="mt-1 text-[9px] uppercase tracking-widest opacity-40"
            style={{ color: 'var(--phosphor-dim)' }}
          >
            {m.model}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Register
// ============================================================

registerApp({
  id: 'ai-chat' as AppId,
  name: 'NEXUS AI',
  icon: '⬡',
  component: AiChatApp,
  defaultSize: { w: 760, h: 560 },
  minSize: { w: 380, h: 360 },
  singleton: false,
  pinned: true,
  category: 'ai',
  title: 'NEXUS AI',
})

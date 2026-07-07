// ============================================================
// NEXUS OS — client-side SSE streaming helper
//
// streamChat() POSTs to /api/ai/chat and reads the SSE response
// body via getReader(), parsing `data: {...}` lines. Each delta is
// handed to onToken(). Supports AbortController cancellation.
//
// fetchModels() GETs /api/ai/models and returns the catalogue.
//
// All paths are RELATIVE so Caddy can forward correctly.
// ============================================================

import type { ChatMessage, ModelOption } from './types'

export interface StreamChatParams {
  messages: ChatMessage[]
  model?: string
  systemPrompt?: string
  temperature?: number
  signal?: AbortSignal
  onToken: (delta: string) => void
  onError?: (message: string) => void
}

/**
 * Stream a chat completion. Resolves when the stream ends or errors.
 * Throws on network failure; per-token errors are routed to onError
 * (the stream is then considered complete).
 */
export async function streamChat(params: StreamChatParams): Promise<void> {
  const { messages, model, systemPrompt, temperature, signal, onToken, onError } = params
  const resp = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model, systemPrompt, temperature }),
    signal,
  })

  if (!resp.ok || !resp.body) {
    let message = `HTTP ${resp.status}`
    try {
      const j = (await resp.json()) as { error?: string }
      if (j?.error) message = j.error
    } catch {
      /* ignore */
    }
    onError?.(message)
    return
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep = buffer.indexOf('\n\n')
      while (sep >= 0) {
        const rawEvent = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        handleSseEvent(rawEvent, onToken, onError)
        sep = buffer.indexOf('\n\n')
      }
    }
    buffer += decoder.decode()
    if (buffer.trim().length > 0) {
      handleSseEvent(buffer, onToken, onError)
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* noop */
    }
  }
}

function handleSseEvent(
  raw: string,
  onToken: (delta: string) => void,
  onError?: (message: string) => void,
): void {
  const lines = raw.split('\n')
  for (const line of lines) {
    const trimmed = line.trimStart()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload) continue
    if (payload === '[DONE]') return
    try {
      const obj = JSON.parse(payload) as { delta?: string; error?: string }
      if (typeof obj.delta === 'string' && obj.delta.length > 0) onToken(obj.delta)
      if (typeof obj.error === 'string' && obj.error.length > 0) onError?.(obj.error)
    } catch {
      /* partial JSON across chunks — ignore */
    }
  }
}

export interface ModelsResponse {
  count: number
  available: number
  default: string
  models: ModelOption[]
}

/** Fetch the model catalogue. */
export async function fetchModels(): Promise<ModelsResponse> {
  const resp = await fetch('/api/ai/models', { cache: 'no-store' })
  if (!resp.ok) {
    throw new Error(`Failed to load models: HTTP ${resp.status}`)
  }
  return (await resp.json()) as ModelsResponse
}

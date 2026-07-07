// ============================================================
// NEXUS OS — OpenAI-compatible provider
//
// Reusable adapter for any upstream that speaks the OpenAI
// `/chat/completions` dialect. Concrete providers (openai, groq,
// cerebras, openrouter, mistral, novita, nvidia, qwen, opencodezen,
// kilocode) are thin config wrappers around this class.
//
// Stream parsing: the response body is a ReadableStream of bytes.
// We decode with TextDecoder (stream:true so multi-byte UTF-8 chars
// spanning chunks don't get mangled), buffer, split on \n\n (SSE
// event boundaries), and within each event pull lines that start
// with `data: `. `data: [DONE]` ends the stream.
// ============================================================

import type { ChatMessage, CompletionRequest, ModelOption, ProviderEntry } from '../types'
import type { Provider } from './registry'

export interface OpenAiCompatModelConfig {
  /** Native upstream model id. */
  nativeId: string
  /** Human label. */
  label: string
  description: string
  contextWindow: number
  supportsVision?: boolean
  supportsTools?: boolean
  tier: ModelOption['tier']
  isFree?: boolean
}

export interface OpenAiCompatProviderConfig {
  id: string
  label: string
  baseUrl: string
  /** Name of the env var holding the API key. */
  apiKeyEnvVar: string
  /** Optional extra headers (e.g. OpenRouter's HTTP-Referer / X-Title). */
  headerExtras?: Record<string, string>
  models: OpenAiCompatModelConfig[]
  /** URL to obtain the key, surfaced in the picker. */
  keyUrl?: string
  /** Path appended to baseUrl for chat completions. Default `/chat/completions`. */
  chatCompletionsPath?: string
}

export class OpenAiCompatProvider implements Provider {
  readonly id: string
  readonly label: string
  protected cfg: OpenAiCompatProviderConfig

  constructor(cfg: OpenAiCompatProviderConfig) {
    this.id = cfg.id
    this.label = cfg.label
    this.cfg = cfg
  }

  // ----- availability --------------------------------------------------

  protected get apiKey(): string | undefined {
    return process.env[this.cfg.apiKeyEnvVar]
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey)
  }

  unavailableReason(): string | null {
    if (this.isAvailable()) return null
    return `Missing ${this.cfg.apiKeyEnvVar} env var. ${this.cfg.keyUrl ? `Get a key at ${this.cfg.keyUrl}` : ''}`.trim()
  }

  listModels(): ModelOption[] {
    const available = this.isAvailable()
    return this.cfg.models.map((m) => ({
      id: `${this.id}:${m.nativeId}`,
      label: m.label,
      provider: this.id,
      description: m.description,
      contextWindow: m.contextWindow,
      supportsVision: m.supportsVision ?? false,
      supportsTools: m.supportsTools ?? false,
      tier: m.tier,
      isFree: m.isFree ?? false,
      available,
      requiresKey: true,
      keyUrl: this.cfg.keyUrl,
    }))
  }

  // ----- request building ---------------------------------------------

  protected buildBody(req: CompletionRequest, nativeId: string, stream: boolean) {
    const messages: ChatMessage[] = []
    if (req.systemPrompt && req.systemPrompt.trim()) {
      messages.push({ role: 'system', content: req.systemPrompt })
    }
    for (const m of req.messages) messages.push(m)

    const body: Record<string, unknown> = {
      model: nativeId,
      messages,
      stream,
    }
    if (typeof req.temperature === 'number') body.temperature = req.temperature
    if (typeof req.maxTokens === 'number') body.max_tokens = req.maxTokens
    return body
  }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey ?? ''}`,
    }
    if (this.cfg.headerExtras) {
      for (const [k, v] of Object.entries(this.cfg.headerExtras)) headers[k] = v
    }
    return headers
  }

  protected chatUrl(): string {
    const path = this.cfg.chatCompletionsPath ?? '/chat/completions'
    return `${this.cfg.baseUrl}${path}`
  }

  // ----- non-streaming -------------------------------------------------

  async complete(req: CompletionRequest, entry: ProviderEntry): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error(this.unavailableReason() ?? `${this.label} unavailable`)
    }
    const url = this.chatUrl()
    const body = this.buildBody(req, entry.nativeId, false)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90_000)
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!resp.ok) {
        const errText = await safeText(resp)
        throw new Error(`${this.label} ${resp.status}: ${errText.slice(0, 500)}`)
      }
      const json = await resp.json()
      const content = json?.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw new Error(`${this.label}: malformed response (no choices[0].message.content)`)
      }
      return content
    } finally {
      clearTimeout(timeout)
    }
  }

  // ----- streaming -----------------------------------------------------

  async *stream(
    req: CompletionRequest,
    entry: ProviderEntry,
  ): AsyncGenerator<string, void, unknown> {
    if (!this.isAvailable()) {
      throw new Error(this.unavailableReason() ?? `${this.label} unavailable`)
    }
    const url = this.chatUrl()
    const body = this.buildBody(req, entry.nativeId, true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90_000)
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!resp.ok || !resp.body) {
        const errText = await safeText(resp)
        throw new Error(`${this.label} ${resp.status}: ${errText.slice(0, 500)}`)
      }
      yield* parseSseStream(resp.body)
    } finally {
      clearTimeout(timeout)
    }
  }
}

// ----- helpers ---------------------------------------------------------

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text()
  } catch {
    return '<no body>'
  }
}

/**
 * Parse an OpenAI-dialect SSE stream. Yields `choices[0].delta.content`
 * deltas and stops on `data: [DONE]`. Robust to chunk boundaries
 * (buffers partial events) and multi-byte UTF-8 (TextDecoder stream:true).
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE events are separated by a blank line.
      let sep = buffer.indexOf('\n\n')
      while (sep >= 0) {
        const rawEvent = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const delta = parseSseEvent(rawEvent)
        if (delta !== null) yield delta
        sep = buffer.indexOf('\n\n')
      }
    }
    // Flush trailing decoder bytes.
    buffer += decoder.decode()
    if (buffer.trim().length > 0) {
      const delta = parseSseEvent(buffer)
      if (delta !== null) yield delta
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* noop */
    }
  }
}

/** Pull the first `data: ...` payload out of an SSE event and extract content. */
function parseSseEvent(raw: string): string | null {
  const lines = raw.split('\n')
  for (const line of lines) {
    const trimmed = line.trimStart()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload) continue
    if (payload === '[DONE]') return null
    try {
      const json = JSON.parse(payload)
      const delta = json?.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta.length > 0) return delta
    } catch {
      // Partial JSON across chunks — ignore; we'll get a full event next.
    }
  }
  return null
}

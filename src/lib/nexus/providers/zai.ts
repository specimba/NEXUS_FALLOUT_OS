// ============================================================
// NEXUS OS — z.ai provider (always available, preinstalled)
//
// Uses z-ai-web-dev-sdk (configured via /etc/.z-ai-config). The SDK
// is lazy-loaded on first use so client bundles never pull it in.
// Streaming: the SDK returns the raw ReadableStream when stream:true
// is passed, so we reuse the same SSE parser as OpenAiCompatProvider.
//
// Models (native ids the SDK understands):
//   glm-5.2       flagship
//   glm-5         frontier
//   glm-5v-turbo  vision
//   glm-4.6       standard
//   glm-4-flash   fast
// ============================================================

import type { CompletionRequest, ModelOption, ProviderEntry } from '../types'
import type { Provider } from './registry'
import { parseSseStream } from './openai-compat'

const ZAI_MODELS: Array<{
  nativeId: string
  label: string
  description: string
  contextWindow: number
  tier: ModelOption['tier']
  supportsVision?: boolean
  supportsTools?: boolean
}> = [
  { nativeId: 'glm-5.2', label: 'GLM-5.2', description: 'Z.ai flagship — best overall quality', contextWindow: 128_000, tier: 'flagship', supportsTools: true, supportsVision: true },
  { nativeId: 'glm-5', label: 'GLM-5', description: 'Z.ai frontier model', contextWindow: 128_000, tier: 'frontier', supportsTools: true },
  { nativeId: 'glm-5v-turbo', label: 'GLM-5V Turbo', description: 'Vision-capable, turbo-speed', contextWindow: 64_000, tier: 'fast', supportsVision: true },
  { nativeId: 'glm-4.6', label: 'GLM-4.6', description: 'Stable general-purpose model', contextWindow: 128_000, tier: 'standard' },
  { nativeId: 'glm-4-flash', label: 'GLM-4 Flash', description: 'Fastest, cheapest, low-latency', contextWindow: 128_000, tier: 'fast' },
]

type ZaiClient = {
  chat: {
    completions: {
      create: (body: Record<string, unknown>) => Promise<unknown>
    }
  }
}

let zaiPromise: Promise<ZaiClient> | null = null

async function getZai(): Promise<ZaiClient> {
  if (!zaiPromise) {
    // Lazy load so this module is safe to import from client bundles.
    zaiPromise = (async () => {
      const mod = await import('z-ai-web-dev-sdk')
      const ZAI = (mod as { default: { create: () => Promise<ZaiClient> } }).default
      return ZAI.create()
    })()
  }
  return zaiPromise
}

export class ZaiProvider implements Provider {
  readonly id = 'zai'
  readonly label = 'Z.ai (GLM)'

  isAvailable(): boolean {
    return true
  }

  unavailableReason(): string | null {
    return null
  }

  listModels(): ModelOption[] {
    return ZAI_MODELS.map((m) => ({
      id: `${this.id}:${m.nativeId}`,
      label: m.label,
      provider: this.id,
      description: m.description,
      contextWindow: m.contextWindow,
      supportsVision: m.supportsVision ?? false,
      supportsTools: m.supportsTools ?? false,
      tier: m.tier,
      isFree: true,
      available: true,
      requiresKey: false,
    }))
  }

  private buildMessages(req: CompletionRequest): Array<{ role: string; content: string }> {
    const out: Array<{ role: string; content: string }> = []
    if (req.systemPrompt && req.systemPrompt.trim()) {
      out.push({ role: 'system', content: req.systemPrompt })
    }
    for (const m of req.messages) out.push({ role: m.role, content: m.content })
    return out
  }

  async complete(req: CompletionRequest, entry: ProviderEntry): Promise<string> {
    const zai = await getZai()
    const body: Record<string, unknown> = {
      model: entry.nativeId || 'glm-5.2',
      messages: this.buildMessages(req),
      stream: false,
    }
    if (typeof req.temperature === 'number') body.temperature = req.temperature
    if (typeof req.maxTokens === 'number') body.max_tokens = req.maxTokens
    const result = (await zai.chat.completions.create(body)) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = result?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new Error('z.ai: malformed response (no choices[0].message.content)')
    }
    return content
  }

  async *stream(
    req: CompletionRequest,
    entry: ProviderEntry,
  ): AsyncGenerator<string, void, unknown> {
    const zai = await getZai()
    const body: Record<string, unknown> = {
      model: entry.nativeId || 'glm-5.2',
      messages: this.buildMessages(req),
      stream: true,
    }
    if (typeof req.temperature === 'number') body.temperature = req.temperature
    if (typeof req.maxTokens === 'number') body.max_tokens = req.maxTokens
    const stream = (await zai.chat.completions.create(body)) as ReadableStream<Uint8Array>
    if (!stream || typeof (stream as { getReader?: unknown }).getReader !== 'function') {
      // SDK didn't return a stream (content-type negotiation); fall back to complete.
      const text = await this.complete(req, entry)
      if (text) yield text
      return
    }
    yield* parseSseStream(stream)
  }
}

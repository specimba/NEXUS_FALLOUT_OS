// src/lib/nexus/zai-shared.ts
// Lazy, dynamic import of `z-ai-web-dev-sdk` so the SDK only loads when the
// `ask` command / route is actually called. Keeps the cold-boot path lean.

import type { ChatMessage } from 'z-ai-web-dev-sdk'

type ZaiInstance = {
  chat: {
    completions: {
      create: (body: {
        model?: string
        messages: ChatMessage[]
        stream?: boolean
        thinking?: { type: 'enabled' | 'disabled' }
        [k: string]: unknown
      }) => Promise<{
        choices?: Array<{ message?: { content?: string } }>
      }>
    }
  }
}

let _zai: ZaiInstance | null = null

async function getZai(): Promise<ZaiInstance> {
  if (_zai) return _zai
  const mod = (await import('z-ai-web-dev-sdk')) as unknown as {
    default: { create: () => Promise<ZaiInstance> }
  }
  _zai = await mod.default.create()
  return _zai
}

export interface CallZaiOpts {
  model?: string
  temperature?: number
  maxTokens?: number
  thinking?: 'enabled' | 'disabled'
}

/**
 * Call the ZAI chat completions endpoint directly. Returns the assistant's
 * message string. Throws on any failure so callers can surface the error.
 */
export async function callZaiDirect(
  messages: ChatMessage[],
  opts: CallZaiOpts = {}
): Promise<string> {
  const zai = await getZai()
  const completion = await zai.chat.completions.create({
    model: opts.model ?? 'GLM-5.2',
    messages,
    thinking: { type: opts.thinking ?? 'disabled' },
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
  })
  const content = completion?.choices?.[0]?.message?.content
  if (!content) throw new Error('empty completion from z-ai-web-dev-sdk')
  return content
}

/** Reset the cached SDK instance (used by tests / hot reload). */
export function resetZai(): void {
  _zai = null
}

// ============================================================
// NEXUS OS — LLM dispatch (server-only)
//
// Thin dispatcher over the provider registry. Composite model ids
// (`<providerId>:<nativeId>`) are split; the provider is looked up
// and either .complete() or .stream() is called.
//
// This module MUST stay server-only — it imports the provider
// registry which reads process.env, and z-ai-web-dev-sdk must never
// be pulled into a client bundle.
// ============================================================

import type { CompletionRequest } from './types'
import { getProvider, splitModelId } from './providers'
import { getDefaultModel } from './providers/index'

/** Resolve a model id to a concrete provider + native id, throwing clearly. */
function resolve(modelId: string): { providerId: string; nativeId: string; provider: NonNullable<ReturnType<typeof getProvider>> } {
  const entry = splitModelId(modelId)
  const provider = getProvider(entry.id)
  if (!provider) {
    throw new Error(`Unknown LLM provider: "${entry.id}" (model id: "${modelId}")`)
  }
  if (!provider.isAvailable()) {
    throw new Error(
      `Provider "${provider.label}" is unavailable: ${provider.unavailableReason() ?? 'no reason given'}`,
    )
  }
  if (!entry.nativeId) {
    throw new Error(`Malformed model id "${modelId}" — expected "<providerId>:<nativeId>"`)
  }
  return { providerId: entry.id, nativeId: entry.nativeId, provider }
}

/** Non-streaming completion. Returns the full assistant text. */
export async function complete(req: CompletionRequest): Promise<string> {
  const { provider, nativeId } = resolve(req.model)
  return provider.complete(req, { id: provider.id, nativeId })
}

/** Streaming completion. Yields incremental text deltas. */
export async function* streamComplete(
  req: CompletionRequest,
): AsyncGenerator<string, void, unknown> {
  const { provider, nativeId } = resolve(req.model)
  yield* provider.stream(req, { id: provider.id, nativeId })
}

/**
 * Convenience wrapper: ask a single prompt and get a single string back.
 * Falls back to the default model when none is supplied.
 */
export async function askOnce(prompt: string, model?: string): Promise<string> {
  const modelId = model && model.trim() ? model : getDefaultModel().id
  return complete({
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
  })
}

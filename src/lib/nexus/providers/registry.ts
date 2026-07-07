// ============================================================
// NEXUS OS — Provider registry
//
// Every LLM provider (zai, openai, groq, ...) implements the
// `Provider` interface and registers itself via registerProvider().
// The dispatch layer (llm.ts) looks providers up by id and either
// calls .complete() (non-streaming) or .stream() (async generator
// of text deltas).
//
// Model ids are namespaced: `<providerId>:<nativeId>`. The provider
// extracts the native id from the composite id before forwarding to
// the upstream API.
// ============================================================

import type {
  CompletionRequest,
  ModelOption,
  ProviderEntry,
} from '../types'

export interface Provider {
  /** Stable provider id, e.g. `zai`, `openai`, `groq`. */
  id: string
  /** Human label, e.g. `OpenAI`, `Groq (LPU)`. */
  label: string
  /** Whether this provider is usable right now (key configured etc). */
  isAvailable(): boolean
  /** Human reason when !isAvailable(). */
  unavailableReason(): string | null
  /** Models offered by this provider (availability flags already filled in). */
  listModels(): ModelOption[]
  /** Non-streaming completion. Returns the full assistant text. */
  complete(req: CompletionRequest, entry: ProviderEntry): Promise<string>
  /** Streaming completion. Yields incremental text deltas. */
  stream(req: CompletionRequest, entry: ProviderEntry): AsyncGenerator<string, void, unknown>
}

// ----- registry -------------------------------------------------------

const registry = new Map<string, Provider>()

export function registerProvider(provider: Provider): Provider {
  registry.set(provider.id, provider)
  return provider
}

export function getProvider(id: string): Provider | undefined {
  return registry.get(id)
}

export function listProviders(): Provider[] {
  return Array.from(registry.values())
}

export function listAvailableProviders(): Provider[] {
  return listProviders().filter((p) => p.isAvailable())
}

/**
 * Split `<providerId>:<nativeId>` into its parts. The native id may
 * itself contain colons (e.g. `openrouter:nvidia/nemotron-...:free`),
 * so only the FIRST colon is the separator.
 */
export function splitModelId(modelId: string): ProviderEntry {
  const idx = modelId.indexOf(':')
  if (idx < 0) {
    return { id: modelId, nativeId: '' }
  }
  return {
    id: modelId.slice(0, idx),
    nativeId: modelId.slice(idx + 1),
  }
}

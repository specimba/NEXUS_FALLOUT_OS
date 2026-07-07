// ============================================================
// NEXUS OS — LLM provider types
//
// Shared by every provider in src/lib/nexus/providers/* and the
// dispatch layer in src/lib/nexus/llm.ts. The model id convention
// is `<providerId>:<nativeId>` (e.g. `zai:glm-5.2`,
// `openai:gpt-5.5`, `groq:openai/gpt-oss-120b`).
// ============================================================

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export type ModelTier = 'flagship' | 'frontier' | 'fast' | 'code' | 'reasoning' | 'standard'

export interface ModelOption {
  /** Composite id: `<providerId>:<nativeId>`. */
  id: string
  /** Human label shown in the picker. */
  label: string
  /** Provider id (matches Provider.id). */
  provider: string
  /** Short one-line description. */
  description: string
  /** Approximate context window in tokens. */
  contextWindow: number
  /** Supports image / vision input. */
  supportsVision: boolean
  /** Supports tool / function calling. */
  supportsTools: boolean
  /** Capability tier for badges + filtering. */
  tier: ModelTier
  /** Free-tier model (no billing). */
  isFree: boolean
  /** True if the provider key is configured at runtime. */
  available: boolean
  /** True if this model requires a provider key. */
  requiresKey: boolean
  /** URL to obtain the provider API key. */
  keyUrl?: string
}

export interface CompletionRequest {
  /** Composite model id `<providerId>:<nativeId>`. */
  model: string
  /** Full conversation history (oldest first). */
  messages: ChatMessage[]
  /** Sampling temperature (0..2). Defaults to 0.7. */
  temperature?: number
  /** Max tokens to generate. */
  maxTokens?: number
  /** Optional system prompt prepended to messages. */
  systemPrompt?: string
}

export interface CompletionResponse {
  content: string
  model: string
  /** Wall-clock latency in ms. */
  latencyMs: number
}

export interface ProviderEntry {
  id: string
  nativeId: string
}

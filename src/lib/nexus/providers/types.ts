// Nexus provider + model catalog types.
//
// A provider can be `available: false` (i.e. blocked) — this happens when the
// sandbox cannot reach the upstream API at all (region-blocked, no balance,
// Cloudflare wall, etc.). Models inherit their provider's availability so the
// UI can grey them out honestly instead of letting users discover the failure
// at request time.

export type ProviderId =
  | 'zai'
  | 'openrouter'
  | 'mistral'
  | 'nvidia'
  | 'qwen'
  | 'opencodezen'
  | 'kilocode'
  | 'groq'
  | 'cerebras'
  | 'openai'
  | 'novita'

export type ModelTier = 'reasoning' | 'balanced' | 'fast' | 'free'

export interface Provider {
  id: ProviderId
  name: string
  baseUrl: string
  apiKeyEnv: string
  /** True when the upstream is reachable from this sandbox. */
  available: boolean
  /** True when the provider is intentionally marked unreachable. */
  blocked?: boolean
  /** Human-readable reason the provider is blocked (shown in UI tooltip). */
  blockedReason?: string
  docsUrl?: string
}

export interface ModelOption {
  /** Stable client-side id (provider:model-handle). */
  id: string
  providerId: ProviderId
  /** The actual upstream model string sent in the API request body. */
  model: string
  name: string
  tier: ModelTier
  supportsTools: boolean
  /** 0–100, software-engineering benchmark estimate. */
  sweScore: number
  description: string
  /** True for `:free` / `-free` suffixed aggregator models. */
  free?: boolean
  /** Maximum output context tokens (best-effort). */
  contextWindow?: number
}

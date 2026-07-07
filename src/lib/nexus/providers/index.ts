// ============================================================
// NEXUS OS — Provider index
//
// Importing this module registers all 11 providers as a side effect.
// listAllModels() returns a flattened, cached list of every model
// across every provider. The cache is keyed by an "env signature"
// (which provider keys are present) so adding a key at runtime and
// re-calling picks up the new availability without a restart.
//
// getDefaultModel() preference order:
//   1. zai:glm-5.2           (always available, flagship)
//   2. openai:gpt-5.5        (when OPENAI_API_KEY is set)
//   3. groq:openai/gpt-oss-120b  (when GROQ_API_KEY is set)
//   4. first available model from any provider
//   5. first model period (fallback so callers always get something)
// ============================================================

import type { ModelOption } from '../types'
import { listProviders } from './registry'

// Importing each module registers its provider as a side effect.
import './openai'
import './groq'
import './cerebras'
import './openrouter'
import './mistral'
import './novita'
import './nvidia'
import './qwen'
import './opencodezen'
import './kilocode'
import './zai'

let cachedSignature = ''
let cachedModels: ModelOption[] = []

/** Snapshot of which provider env vars are currently set. */
function envSignature(): string {
  const vars = [
    'OPENAI_API_KEY',
    'GROQ_API_KEY',
    'CEREBRAS_API_KEY',
    'OPENROUTER_API_KEY',
    'MISTRAL_API_KEY',
    'NOVITA_API_KEY',
    'NVIDIA_NIM_API_KEY',
    'QWEN_API_KEY',
    'OPENCODE_ZEN_API_KEY',
    'KILOCODE_API_KEY',
  ]
  return vars.map((v) => (process.env[v] ? '1' : '0')).join('')
}

export function listAllModels(): ModelOption[] {
  const sig = envSignature()
  if (sig === cachedSignature && cachedModels.length > 0) {
    return cachedModels
  }
  const models: ModelOption[] = []
  for (const provider of listProviders()) {
    for (const m of provider.listModels()) models.push(m)
  }
  cachedSignature = sig
  cachedModels = models
  return models
}

export function getDefaultModel(): ModelOption {
  const all = listAllModels()
  const find = (id: string) => all.find((m) => m.id === id && m.available)

  return (
    find('zai:glm-5.2') ??
    find('openai:gpt-5.5') ??
    find('groq:openai/gpt-oss-120b') ??
    all.find((m) => m.available) ??
    all[0]
  )
}

export { getProvider, listProviders, listAvailableProviders, splitModelId } from './registry'
export type { Provider } from './registry'

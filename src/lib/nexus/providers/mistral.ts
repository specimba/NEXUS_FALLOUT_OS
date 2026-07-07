// ============================================================
// NEXUS OS — Mistral AI provider
// ============================================================

import { OpenAiCompatProvider } from './openai-compat'
import { registerProvider } from './registry'

export const mistralProvider = new OpenAiCompatProvider({
  id: 'mistral',
  label: 'Mistral AI',
  baseUrl: 'https://api.mistral.ai/v1',
  apiKeyEnvVar: 'MISTRAL_API_KEY',
  keyUrl: 'https://console.mistral.ai/api-keys',
  models: [
    { nativeId: 'mistral-large-latest', label: 'Mistral Large', description: 'Flagship Mistral model', contextWindow: 128_000, tier: 'flagship', supportsTools: true, supportsVision: true },
    { nativeId: 'mistral-medium-latest', label: 'Mistral Medium', description: 'Balanced quality + cost', contextWindow: 128_000, tier: 'standard', supportsTools: true },
    { nativeId: 'devstral-medium-latest', label: 'Devstral Medium', description: 'Code-tuned Mistral variant', contextWindow: 128_000, tier: 'code', supportsTools: true },
    { nativeId: 'codestral-latest', label: 'Codestral', description: 'Code generation specialist', contextWindow: 256_000, tier: 'code' },
    { nativeId: 'magistral-medium-latest', label: 'Magistral Medium', description: 'Reasoning-focused Mistral', contextWindow: 128_000, tier: 'reasoning', supportsTools: true },
  ],
})

registerProvider(mistralProvider)

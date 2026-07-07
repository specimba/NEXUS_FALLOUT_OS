// ============================================================
// NEXUS OS — OpenAI provider
// ============================================================

import { OpenAiCompatProvider } from './openai-compat'
import { registerProvider } from './registry'

export const openaiProvider = new OpenAiCompatProvider({
  id: 'openai',
  label: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  apiKeyEnvVar: 'OPENAI_API_KEY',
  keyUrl: 'https://platform.openai.com/api-keys',
  models: [
    { nativeId: 'gpt-5.5', label: 'GPT-5.5', description: 'OpenAI flagship frontier model', contextWindow: 400_000, tier: 'flagship', supportsVision: true, supportsTools: true },
    { nativeId: 'gpt-5.4', label: 'GPT-5.4', description: 'High-quality reasoning + tools', contextWindow: 256_000, tier: 'frontier', supportsVision: true, supportsTools: true },
    { nativeId: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', description: 'Fast, cheaper frontier model', contextWindow: 256_000, tier: 'fast', supportsVision: true, supportsTools: true },
    { nativeId: 'gpt-5', label: 'GPT-5', description: 'Previous-gen flagship', contextWindow: 200_000, tier: 'frontier', supportsVision: true, supportsTools: true },
    { nativeId: 'gpt-5-mini', label: 'GPT-5 Mini', description: 'Lightweight general model', contextWindow: 200_000, tier: 'fast', supportsTools: true },
    { nativeId: 'o4', label: 'o4', description: 'Deep reasoning model', contextWindow: 200_000, tier: 'reasoning', supportsVision: true, supportsTools: true },
  ],
})

registerProvider(openaiProvider)

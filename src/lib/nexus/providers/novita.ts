// ============================================================
// NEXUS OS — Novita AI provider
//
// Account has insufficient balance in this sandbox (403 on every
// call). Surfaced as unavailable so the picker greys it out.
// ============================================================

import { OpenAiCompatProvider } from './openai-compat'
import { registerProvider } from './registry'

class NovitaProvider extends OpenAiCompatProvider {
  isAvailable(): boolean {
    return false
  }
  unavailableReason(): string | null {
    return 'Insufficient balance (403). Novita account is out of credit.'
  }
}

export const novitaProvider = new NovitaProvider({
  id: 'novita',
  label: 'Novita AI',
  baseUrl: 'https://api.novita.ai/v3/openai',
  apiKeyEnvVar: 'NOVITA_API_KEY',
  keyUrl: 'https://novita.ai/settings/key-management',
  models: [
    { nativeId: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro', description: 'DeepSeek V4 Pro via Novita', contextWindow: 128_000, tier: 'frontier', supportsTools: true },
    { nativeId: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', description: 'Fast DeepSeek V4 variant', contextWindow: 128_000, tier: 'fast' },
    { nativeId: 'zai-org/glm-5.2', label: 'GLM-5.2', description: 'Z.ai GLM-5.2 via Novita', contextWindow: 128_000, tier: 'flagship', supportsVision: true, supportsTools: true },
    { nativeId: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', description: 'Meta Llama 4 Scout', contextWindow: 128_000, tier: 'standard' },
    { nativeId: 'qwen/qwen3-coder', label: 'Qwen3 Coder', description: 'Qwen3 coder model', contextWindow: 128_000, tier: 'code' },
  ],
})

registerProvider(novitaProvider)

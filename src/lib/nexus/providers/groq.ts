// ============================================================
// NEXUS OS — Groq provider (LPU inference)
// ============================================================

import { OpenAiCompatProvider } from './openai-compat'
import { registerProvider } from './registry'

export const groqProvider = new OpenAiCompatProvider({
  id: 'groq',
  label: 'Groq (LPU)',
  baseUrl: 'https://api.groq.com/openai/v1',
  apiKeyEnvVar: 'GROQ_API_KEY',
  keyUrl: 'https://console.groq.com/keys',
  models: [
    { nativeId: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', description: 'Open-weight 120B, ultra-fast', contextWindow: 128_000, tier: 'frontier', supportsTools: true, isFree: true },
    { nativeId: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', description: 'Smaller open-weight, lightning-fast', contextWindow: 128_000, tier: 'fast', supportsTools: true, isFree: true },
    { nativeId: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', description: 'Versatile Llama 3.3', contextWindow: 128_000, tier: 'standard', supportsTools: true },
    { nativeId: 'groq/compound', label: 'Groq Compound', description: 'Multi-model compound system', contextWindow: 128_000, tier: 'frontier', supportsTools: true },
    { nativeId: 'qwen/qwen3-32b', label: 'Qwen3 32B', description: 'Qwen3 coder on Groq LPU', contextWindow: 128_000, tier: 'code', supportsTools: true },
  ],
})

registerProvider(groqProvider)

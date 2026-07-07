// ============================================================
// NEXUS OS — OpenRouter provider (multi-model gateway)
// Sends HTTP-Referer + X-Title headers as required by their ToS.
// ============================================================

import { OpenAiCompatProvider } from './openai-compat'
import { registerProvider } from './registry'

export const openrouterProvider = new OpenAiCompatProvider({
  id: 'openrouter',
  label: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeyEnvVar: 'OPENROUTER_API_KEY',
  keyUrl: 'https://openrouter.ai/keys',
  headerExtras: {
    'HTTP-Referer': 'https://nexus.os',
    'X-Title': 'NEXUS OS',
  },
  models: [
    { nativeId: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra 550B', description: 'NVIDIA Nemotron 3 Ultra (free)', contextWindow: 128_000, tier: 'frontier', supportsTools: true, isFree: true },
    { nativeId: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B', description: 'OpenAI open weights (free)', contextWindow: 128_000, tier: 'frontier', supportsTools: true, isFree: true },
    { nativeId: 'meta-llama/llama-4-scout-17b-16e-instruct:free', label: 'Llama 4 Scout 17B', description: 'Meta Llama 4 Scout (free)', contextWindow: 128_000, tier: 'standard', isFree: true },
    { nativeId: 'deepseek/deepseek-v4-pro:free', label: 'DeepSeek V4 Pro', description: 'DeepSeek V4 Pro (free)', contextWindow: 128_000, tier: 'frontier', supportsTools: true, isFree: true },
    { nativeId: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder', description: 'Qwen3 coder model (free)', contextWindow: 128_000, tier: 'code', isFree: true },
  ],
})

registerProvider(openrouterProvider)

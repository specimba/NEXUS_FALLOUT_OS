// ============================================================
// NEXUS OS — NVIDIA NIM provider
// ============================================================

import { OpenAiCompatProvider } from './openai-compat'
import { registerProvider } from './registry'

export const nvidiaProvider = new OpenAiCompatProvider({
  id: 'nvidia',
  label: 'NVIDIA NIM',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  apiKeyEnvVar: 'NVIDIA_NIM_API_KEY',
  keyUrl: 'https://build.nvidia.com',
  models: [
    { nativeId: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro', description: 'DeepSeek V4 Pro on NIM', contextWindow: 128_000, tier: 'frontier', supportsTools: true },
    { nativeId: 'deepseek-ai/deepseek-v4-flash', label: 'DeepSeek V4 Flash', description: 'Fast DeepSeek V4 on NIM', contextWindow: 128_000, tier: 'fast' },
    { nativeId: 'nvidia/nemotron-3-ultra-550b-a55b', label: 'Nemotron 3 Ultra 550B', description: 'NVIDIA Nemotron 3 Ultra', contextWindow: 128_000, tier: 'frontier', supportsTools: true },
    { nativeId: 'meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', description: 'Meta Llama 4 Scout on NIM', contextWindow: 128_000, tier: 'standard' },
    { nativeId: 'qwen/qwen3-coder', label: 'Qwen3 Coder', description: 'Qwen3 coder on NIM', contextWindow: 128_000, tier: 'code' },
  ],
})

registerProvider(nvidiaProvider)

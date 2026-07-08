// ============================================================
// NEXUS OS — OpenCode Zen provider
// ============================================================

import { OpenAiCompatProvider } from './openai-compat'
import { registerProvider } from './registry'

export const opencodeZenProvider = new OpenAiCompatProvider({
  id: 'opencodezen',
  label: 'OpenCode Zen',
  baseUrl: 'https://opencode.ai/zen/v1',
  apiKeyEnvVar: 'OPENCODE_ZEN_API_KEY',
  keyUrl: 'https://opencode.ai',
  models: [
    // Paid tier
    { nativeId: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', description: 'DeepSeek V4 Pro via Zen', contextWindow: 128_000, tier: 'frontier', supportsTools: true },
    { nativeId: 'glm-5.2', label: 'GLM-5.2', description: 'Z.ai GLM-5.2 via Zen', contextWindow: 128_000, tier: 'flagship', supportsVision: true, supportsTools: true },
    { nativeId: 'gpt-5.5', label: 'GPT-5.5', description: 'OpenAI GPT-5.5 via Zen', contextWindow: 128_000, tier: 'flagship', supportsVision: true, supportsTools: true },

    // Free tier — already had DeepSeek V4 Flash free; expand with the
    // rest of the free catalogue.
    { nativeId: 'deepseek-v4-flash-free', label: 'DeepSeek V4 Flash (Free)', description: 'Free fast DeepSeek V4', contextWindow: 128_000, tier: 'fast', isFree: true },
    { nativeId: 'deepseek-v4-pro-free', label: 'DeepSeek V4 Pro (Free)', description: 'Free DeepSeek V4 Pro', contextWindow: 128_000, tier: 'frontier', supportsTools: true, isFree: true },
    { nativeId: 'qwen3-coder-free', label: 'Qwen3 Coder (Free)', description: 'Free Qwen3 coder', contextWindow: 128_000, tier: 'code', supportsTools: true, isFree: true },
    { nativeId: 'glm-5-free', label: 'GLM-5 (Free)', description: 'Free Z.ai GLM-5', contextWindow: 128_000, tier: 'flagship', supportsVision: true, supportsTools: true, isFree: true },
    { nativeId: 'gpt-oss-120b-free', label: 'GPT-OSS 120B (Free)', description: 'Free open-weight 120B', contextWindow: 128_000, tier: 'frontier', supportsTools: true, isFree: true },
    { nativeId: 'llama-4-scout-free', label: 'Llama 4 Scout (Free)', description: 'Free Meta Llama 4 Scout', contextWindow: 128_000, tier: 'standard', isFree: true },
    { nativeId: 'nemotron-3-super-free', label: 'Nemotron 3 Super (Free)', description: 'Free NVIDIA Nemotron 3 Super', contextWindow: 128_000, tier: 'frontier', isFree: true },
  ],
})

registerProvider(opencodeZenProvider)

// ============================================================
// NEXUS OS — Kilo Code provider (gateway)
// ============================================================

import { OpenAiCompatProvider } from './openai-compat'
import { registerProvider } from './registry'

export const kilocodeProvider = new OpenAiCompatProvider({
  id: 'kilocode',
  label: 'Kilo Code',
  baseUrl: 'https://api.kilo.ai/api/gateway',
  apiKeyEnvVar: 'KILOCODE_API_KEY',
  keyUrl: 'https://kilo.ai',
  models: [
    // Paid flagship routing
    { nativeId: 'anthropic/claude-opus-4.8', label: 'Claude Opus 4.8', description: 'Anthropic flagship via Kilo', contextWindow: 200_000, tier: 'flagship', supportsVision: true, supportsTools: true },
    { nativeId: 'openai/gpt-5.5', label: 'GPT-5.5', description: 'OpenAI GPT-5.5 via Kilo', contextWindow: 400_000, tier: 'flagship', supportsVision: true, supportsTools: true },
    { nativeId: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro', description: 'DeepSeek V4 Pro via Kilo', contextWindow: 128_000, tier: 'frontier', supportsTools: true },
    { nativeId: 'zai-org/glm-5.2', label: 'GLM-5.2', description: 'Z.ai GLM-5.2 via Kilo', contextWindow: 128_000, tier: 'flagship', supportsVision: true, supportsTools: true },

    // Free tier — open-weight & community models
    { nativeId: 'deepseek/deepseek-v4-pro:free', label: 'DeepSeek V4 Pro (Free)', description: 'Free tier DeepSeek V4 Pro', contextWindow: 128_000, tier: 'frontier', supportsTools: true, isFree: true },
    { nativeId: 'deepseek/deepseek-v4-flash:free', label: 'DeepSeek V4 Flash (Free)', description: 'Free tier fast DeepSeek V4', contextWindow: 128_000, tier: 'fast', supportsTools: true, isFree: true },
    { nativeId: 'meta-llama/llama-4-scout:free', label: 'Llama 4 Scout (Free)', description: 'Free Meta Llama 4 Scout', contextWindow: 128_000, tier: 'standard', isFree: true },
    { nativeId: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (Free)', description: 'Free Qwen3 coder model', contextWindow: 128_000, tier: 'code', supportsTools: true, isFree: true },
    { nativeId: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B (Free)', description: 'Free open-weight 120B', contextWindow: 128_000, tier: 'frontier', supportsTools: true, isFree: true },
    { nativeId: 'openai/gpt-oss-20b:free', label: 'GPT-OSS 20B (Free)', description: 'Free open-weight 20B', contextWindow: 128_000, tier: 'fast', supportsTools: true, isFree: true },
    { nativeId: 'zai-org/glm-5.2:free', label: 'GLM-5.2 (Free)', description: 'Free Z.ai GLM-5.2', contextWindow: 128_000, tier: 'flagship', supportsVision: true, supportsTools: true, isFree: true },
    { nativeId: 'moonshot/kimi-k2.7-code:free', label: 'Kimi K2.7 Code (Free)', description: 'Free Moonshot Kimi K2.7 coder', contextWindow: 128_000, tier: 'code', supportsTools: true, isFree: true },
  ],
})

registerProvider(kilocodeProvider)

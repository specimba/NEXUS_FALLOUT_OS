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
    { nativeId: 'anthropic/claude-opus-4.8', label: 'Claude Opus 4.8', description: 'Anthropic flagship via Kilo', contextWindow: 200_000, tier: 'flagship', supportsVision: true, supportsTools: true },
    { nativeId: 'openai/gpt-5.5', label: 'GPT-5.5', description: 'OpenAI GPT-5.5 via Kilo', contextWindow: 400_000, tier: 'flagship', supportsVision: true, supportsTools: true },
    { nativeId: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro', description: 'DeepSeek V4 Pro via Kilo', contextWindow: 128_000, tier: 'frontier', supportsTools: true },
    { nativeId: 'zai-org/glm-5.2', label: 'GLM-5.2', description: 'Z.ai GLM-5.2 via Kilo', contextWindow: 128_000, tier: 'flagship', supportsVision: true, supportsTools: true },
  ],
})

registerProvider(kilocodeProvider)

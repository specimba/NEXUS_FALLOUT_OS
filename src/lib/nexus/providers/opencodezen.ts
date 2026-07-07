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
    { nativeId: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', description: 'DeepSeek V4 Pro via Zen', contextWindow: 128_000, tier: 'frontier', supportsTools: true },
    { nativeId: 'glm-5.2', label: 'GLM-5.2', description: 'Z.ai GLM-5.2 via Zen', contextWindow: 128_000, tier: 'flagship', supportsVision: true, supportsTools: true },
    { nativeId: 'deepseek-v4-flash-free', label: 'DeepSeek V4 Flash (Free)', description: 'Free fast DeepSeek V4', contextWindow: 128_000, tier: 'fast', isFree: true },
    { nativeId: 'gpt-5.5', label: 'GPT-5.5', description: 'OpenAI GPT-5.5 via Zen', contextWindow: 128_000, tier: 'flagship', supportsVision: true, supportsTools: true },
  ],
})

registerProvider(opencodeZenProvider)

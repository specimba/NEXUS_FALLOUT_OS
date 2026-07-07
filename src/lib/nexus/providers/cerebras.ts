// ============================================================
// NEXUS OS — Cerebras provider (wafer-scale inference)
// ============================================================

import { OpenAiCompatProvider } from './openai-compat'
import { registerProvider } from './registry'

export const cerebrasProvider = new OpenAiCompatProvider({
  id: 'cerebras',
  label: 'Cerebras',
  baseUrl: 'https://api.cerebras.ai/v1',
  apiKeyEnvVar: 'CEREBRAS_API_KEY',
  keyUrl: 'https://cloud.cerebras.ai',
  models: [
    { nativeId: 'gpt-oss-120b', label: 'GPT-OSS 120B', description: 'Open 120B on Cerebras', contextWindow: 128_000, tier: 'frontier', supportsTools: true, isFree: true },
    { nativeId: 'gemma-4-31b', label: 'Gemma 4 31B', description: 'Google Gemma 4, fast inference', contextWindow: 64_000, tier: 'standard' },
    { nativeId: 'zai-glm-4.7', label: 'Z.ai GLM-4.7', description: 'GLM-4.7 served by Cerebras', contextWindow: 128_000, tier: 'standard', supportsTools: true },
  ],
})

registerProvider(cerebrasProvider)

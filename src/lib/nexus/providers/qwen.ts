// ============================================================
// NEXUS OS — Qwen (Alibaba DashScope) provider
// ============================================================

import { OpenAiCompatProvider } from './openai-compat'
import { registerProvider } from './registry'

export const qwenProvider = new OpenAiCompatProvider({
  id: 'qwen',
  label: 'Qwen (DashScope)',
  baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  apiKeyEnvVar: 'QWEN_API_KEY',
  keyUrl: 'https://dashscope.console.aliyun.com/apiKey',
  models: [
    { nativeId: 'qwen3.7-max', label: 'Qwen3.7 Max', description: 'Qwen3.7 Max flagship', contextWindow: 256_000, tier: 'flagship', supportsTools: true, supportsVision: true },
    { nativeId: 'qwen3-coder-plus', label: 'Qwen3 Coder Plus', description: 'Code-tuned Qwen3', contextWindow: 256_000, tier: 'code', supportsTools: true },
    { nativeId: 'qwen3-235b-a22b', label: 'Qwen3 235B-A22B', description: 'Mixture-of-experts Qwen3', contextWindow: 128_000, tier: 'frontier', supportsTools: true },
  ],
})

registerProvider(qwenProvider)

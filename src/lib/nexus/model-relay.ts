// NEXUS Model Relay — real provider routing with memory.
// Users can switch models via /model command. The system remembers the last
// used model per agent and auto-routes based on task type.

import '@/lib/nexus/keys' // auto-populates process.env with API keys

export type ProviderId = 'dashscope' | 'nvidia' | 'openrouter' | 'zai' | 'opencode'
export type TaskType = 'code' | 'reasoning' | 'fast' | 'chat' | 'research' | 'analysis'

export interface ModelOption {
  id: string
  provider: ProviderId
  model: string
  name: string
  baseUrl: string
  apiKeyEnv: string
  tier: 'reasoning' | 'balanced' | 'fast' | 'free'
  supportsTools: boolean
  sweScore: number // 0-100, software engineering benchmark
  description: string
}

// All available models — verified via live /models API calls
export const MODEL_REGISTRY: ModelOption[] = [
  // DashScope (Qwen Cloud) — fast, free, supports function calling
  {
    id: 'qwen3.7-max',
    provider: 'dashscope',
    model: 'qwen3.7-max',
    name: 'Qwen3.7 Max',
    baseUrl: 'https://ws-85801zgzsbzzc9iy.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    tier: 'reasoning',
    supportsTools: true,
    sweScore: 88,
    description: 'Frontier Qwen model, best for complex coding + reasoning',
  },
  {
    id: 'qwen3.7-plus',
    provider: 'dashscope',
    model: 'qwen3.7-plus',
    name: 'Qwen3.7 Plus',
    baseUrl: 'https://ws-85801zgzsbzzc9iy.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    tier: 'balanced',
    supportsTools: true,
    sweScore: 82,
    description: 'Balanced Qwen, good for general tasks',
  },
  {
    id: 'qwen3.6-flash',
    provider: 'dashscope',
    model: 'qwen3.6-flash',
    name: 'Qwen3.6 Flash',
    baseUrl: 'https://ws-85801zgzsbzzc9iy.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    tier: 'fast',
    supportsTools: true,
    sweScore: 72,
    description: 'Fast Qwen, good for quick responses',
  },
  {
    id: 'glm-5.2',
    provider: 'dashscope',
    model: 'glm-5.2',
    name: 'GLM-5.2',
    baseUrl: 'https://ws-85801zgzsbzzc9iy.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    tier: 'reasoning',
    supportsTools: true,
    sweScore: 85,
    description: 'GLM-5.2 via DashScope, strong reasoning',
  },
  {
    id: 'kimi-k2.7-code',
    provider: 'dashscope',
    model: 'kimi-k2.7-code',
    name: 'Kimi K2.7 Code',
    baseUrl: 'https://ws-85801zgzsbzzc9iy.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    tier: 'balanced',
    supportsTools: true,
    sweScore: 80,
    description: 'Kimi coding specialist',
  },
  {
    id: 'deepseek-v4-flash',
    provider: 'dashscope',
    model: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    baseUrl: 'https://ws-85801zgzsbzzc9iy.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    tier: 'fast',
    supportsTools: true,
    sweScore: 75,
    description: 'Fast DeepSeek, good for quick code',
  },
  // NVIDIA NIM — free tier, supports function calling
  {
    id: 'llama-3.3-70b',
    provider: 'nvidia',
    model: 'meta/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnv: 'NVIDIA_API_KEY',
    tier: 'balanced',
    supportsTools: true,
    sweScore: 78,
    description: 'Meta Llama 3.3, strong general purpose',
  },
  {
    id: 'llama-4-maverick',
    provider: 'nvidia',
    model: 'meta/llama-4-maverick-17b-128e-instruct',
    name: 'Llama 4 Maverick',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnv: 'NVIDIA_API_KEY',
    tier: 'fast',
    supportsTools: false,
    sweScore: 70,
    description: 'Fast Llama 4 variant',
  },
  {
    id: 'deepseek-v4-pro',
    provider: 'nvidia',
    model: 'deepseek-ai/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnv: 'NVIDIA_API_KEY',
    tier: 'reasoning',
    supportsTools: false,
    sweScore: 83,
    description: 'DeepSeek reasoning model',
  },
  // OpenRouter — free models
  {
    id: 'nemotron-ultra-free',
    provider: 'openrouter',
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'Nemotron Ultra (free)',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    tier: 'reasoning',
    supportsTools: true,
    sweScore: 81,
    description: 'NVIDIA Nemotron 550B, free via OpenRouter',
  },
  {
    id: 'gpt-oss-120b-free',
    provider: 'openrouter',
    model: 'openai/gpt-oss-120b:free',
    name: 'GPT-OSS 120B (free)',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    tier: 'reasoning',
    supportsTools: false,
    sweScore: 79,
    description: 'OpenAI open-source 120B, free',
  },
  {
    id: 'qwen3-coder-free',
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
    name: 'Qwen3 Coder (free)',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    tier: 'balanced',
    supportsTools: false,
    sweScore: 76,
    description: 'Qwen coding model, free',
  },
]

// Memory: last used model per agent + global default
const _modelMemory: Map<string, string> = new Map() // agent → modelId
let _globalModel: string = 'qwen3.7-max' // default
let _autoRoute: boolean = true // smart routing enabled

export function getActiveModel(): ModelOption {
  return MODEL_REGISTRY.find((m) => m.id === _globalModel) || MODEL_REGISTRY[0]
}

export function setActiveModel(modelId: string): { ok: boolean; model?: ModelOption; error?: string } {
  const model = MODEL_REGISTRY.find((m) => m.id === modelId)
  if (!model) return { ok: false, error: `unknown model: ${modelId}` }
  _globalModel = modelId
  return { ok: true, model }
}

export function getAgentModel(agent: string): ModelOption {
  const modelId = _modelMemory.get(agent) || _globalModel
  return MODEL_REGISTRY.find((m) => m.id === modelId) || MODEL_REGISTRY[0]
}

export function setAgentModel(agent: string, modelId: string): { ok: boolean; error?: string } {
  const model = MODEL_REGISTRY.find((m) => m.id === modelId)
  if (!model) return { ok: false, error: `unknown model: ${modelId}` }
  _modelMemory.set(agent, modelId)
  return { ok: true }
}

export function isAutoRoute(): boolean { return _autoRoute }
export function setAutoRoute(v: boolean) { _autoRoute = v }

// Smart routing: pick best model based on task type
export function routeModel(task: string, needsTools: boolean): ModelOption {
  if (!_autoRoute) return getActiveModel()

  const lower = task.toLowerCase()
  let taskType: TaskType = 'chat'

  if (lower.match(/code|implement|fix|build|refactor|function|class|script|debug/)) taskType = 'code'
  else if (lower.match(/analyze|review|audit|investigate|examine/)) taskType = 'analysis'
  else if (lower.match(/research|find|search|study|paper/)) taskType = 'research'
  else if (lower.match(/quick|fast|simple|short/)) taskType = 'fast'

  // Filter: must have API key + support tools if needed
  const available = MODEL_REGISTRY.filter((m) => {
    const key = process.env[m.apiKeyEnv]
    if (!key) return false
    if (needsTools && !m.supportsTools) return false
    return true
  })

  if (available.length === 0) return MODEL_REGISTRY[0] // fallback

  // Sort by SWE score for code/analysis, by speed (tier) for fast/chat
  if (taskType === 'code' || taskType === 'analysis' || taskType === 'research') {
    available.sort((a, b) => b.sweScore - a.sweScore)
  } else {
    // For fast/chat, prefer 'fast' tier
    available.sort((a, b) => {
      const tierOrder = { fast: 0, free: 1, balanced: 2, reasoning: 3 }
      return tierOrder[a.tier] - tierOrder[b.tier]
    })
  }

  return available[0]
}

// Get available models (have API keys)
export function getAvailableModels(): ModelOption[] {
  return MODEL_REGISTRY.filter((m) => process.env[m.apiKeyEnv])
}

// Make a chat completion call to any provider
export async function chatCompletion(
  model: ModelOption,
  messages: { role: string; content: string }[],
  opts: { maxTokens?: number; temperature?: number; tools?: unknown[] } = {},
): Promise<{ content: string | null; tool_calls?: unknown[] }> {
  const key = process.env[model.apiKeyEnv]
  if (!key) throw new Error(`${model.name}: API key not set (${model.apiKeyEnv})`)

  const body: Record<string, unknown> = {
    model: model.model,
    messages,
    max_tokens: opts.maxTokens ?? 256,
    temperature: opts.temperature ?? 0.7,
  }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools
    body.tool_choice = 'auto'
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  if (model.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://nexus-os.dev'
    headers['X-Title'] = 'NEXUS OS'
  }

  const res = await fetch(model.baseUrl + '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`${model.name} API ${res.status}: ${txt.slice(0, 120)}`)
  }

  const data = await res.json()
  const msg = data.choices?.[0]?.message
  return { content: msg?.content || null, tool_calls: msg?.tool_calls }
}

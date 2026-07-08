// NEXUS Agent Loop — real multi-step agent execution with tool calling.
// Uses DashScope (Qwen3.7-max) — fast (~2-4s), supports function calling, free.
// NO z-ai SDK dependency. Pure OpenAI-compatible API via fetch.

import '@/lib/nexus/keys' // auto-populates process.env with API keys

export type ToolDef = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type AgentStep = {
  iteration: number
  type: 'thinking' | 'tool_call' | 'tool_result' | 'final'
  content?: string
  toolCalls?: ToolCall[]
  toolResults?: { name: string; result: string; ok: boolean }[]
}

export type AgentLoopResult = {
  ok: boolean
  steps: AgentStep[]
  finalResponse: string
  model: string
  elapsedMs: number
  iterations: number
  toolsUsed: string[]
}

export const AGENT_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file in the virtual filesystem.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'File content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from the virtual filesystem.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', default: '.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_code',
      description: 'Execute Python code and return the output. Use this to test code you have written.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code to execute' },
        },
        required: ['code'],
      },
    },
  },
]

export interface AgentVFS {
  readFile: (path: string) => string | null
  writeFile: (path: string, content: string) => string
  listFiles: (path: string) => string[]
}

// DashScope (Qwen Cloud) — fast, free, function calling
const DS_HOST = process.env.DASHSCOPE_API_HOST || 'dashscope.aliyuncs.com'
const DS_BASE = `https://${DS_HOST}/compatible-mode/v1`
const DS_MODEL = 'qwen3.7-max'

// Fallback: NVIDIA NIM
const NV_BASE = 'https://integrate.api.nvidia.com/v1'
const NV_MODEL = 'meta/llama-3.3-70b-instruct'

type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

function getProvider(): { baseUrl: string; model: string; key: string; name: string } {
  const dsKey = process.env.DASHSCOPE_API_KEY
  if (dsKey) return { baseUrl: DS_BASE, model: DS_MODEL, key: dsKey, name: 'qwen3.7-max (DashScope)' }
  const nvKey = process.env.NVIDIA_API_KEY
  if (nvKey) return { baseUrl: NV_BASE, model: NV_MODEL, key: nvKey, name: 'llama-3.3-70b (NVIDIA)' }
  throw new Error('No API key set (need DASHSCOPE_API_KEY or NVIDIA_API_KEY)')
}

async function callLLM(
  messages: Message[],
  tools: ToolDef[],
  maxTokens = 1024,
): Promise<{ content: string | null; tool_calls?: ToolCall[]; model: string }> {
  const p = getProvider()

  const body: Record<string, unknown> = { model: p.model, messages, max_tokens: maxTokens, temperature: 0.7 }
  if (tools.length > 0) { body.tools = tools; body.tool_choice = 'auto' }

  const res = await fetch(p.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) { const txt = await res.text().catch(() => ''); throw new Error(`LLM API ${res.status}: ${txt.slice(0, 120)}`) }

  const data = await res.json()
  const msg = data.choices?.[0]?.message
  return { content: msg?.content || null, tool_calls: msg?.tool_calls, model: p.model }
}

function executeTool(call: ToolCall, vfs: AgentVFS): { name: string; result: string; ok: boolean; async?: boolean } {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(call.function.arguments)
  } catch {
    const raw = call.function.arguments
    const pathMatch = raw.match(/"path"\s*:\s*"([^"]*)"/)
    const contentMatch = raw.match(/"content"\s*:\s*"([\s\S]*?)(?:"|$)/)
    if (pathMatch) {
      args = { path: pathMatch[1], content: contentMatch ? contentMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"') : '' }
    } else {
      return { name: call.function.name, result: 'tool arguments were truncated', ok: false }
    }
  }
  try {
    switch (call.function.name) {
      case 'write_file': { const p = vfs.writeFile(args.path as string, args.content as string); return { name: 'write_file', result: `file written: ${p} (${(args.content as string).length} bytes)`, ok: true } }
      case 'read_file': { const c = vfs.readFile(args.path as string); return { name: 'read_file', result: c === null ? `file not found: ${args.path}` : c.slice(0, 2000), ok: c !== null } }
      case 'list_files': { const f = vfs.listFiles((args.path as string) || '.'); return { name: 'list_files', result: f.join('\n') || '(empty)', ok: true } }
      case 'run_code': return { name: 'run_code', result: '__ASYNC_CODE__' + (args.code as string), ok: true, async: true }
      default: return { name: call.function.name, result: `unknown tool`, ok: false }
    }
  } catch (e) { return { name: call.function.name, result: `tool error: ${(e as Error).message}`, ok: false } }
}

async function executeRunCode(code: string): Promise<string> {
  try {
    const res = await fetch('http://localhost:3000/api/nexus/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: code, lang: 'python' }),
    })
    const data = (await res.json()) as { ok?: boolean; stdout?: string; stderr?: string; exitCode?: number }
    if (data.ok) return data.stdout || '(no output)'
    return `exit code ${data.exitCode}\n${data.stderr || data.stdout || 'error'}`
  } catch (e) { return `exec error: ${(e as Error).message}` }
}

export async function runAgentLoop(systemPrompt: string, task: string, vfs: AgentVFS, maxIterations = 3): Promise<AgentLoopResult> {
  const t0 = Date.now()
  const steps: AgentStep[] = []
  const toolsUsed: string[] = []
  const messages: Message[] = [{ role: 'system', content: systemPrompt }, { role: 'user', content: task }]
  let usedModel = 'unknown'

  for (let i = 0; i < maxIterations; i++) {
    const response = await callLLM(messages, AGENT_TOOLS)
    usedModel = response.model

    if (response.tool_calls && response.tool_calls.length > 0) {
      steps.push({ iteration: i + 1, type: 'tool_call', content: response.content || undefined, toolCalls: response.tool_calls })
      messages.push({ role: 'assistant', content: response.content, tool_calls: response.tool_calls })

      const toolResults: { name: string; result: string; ok: boolean }[] = []
      for (const call of response.tool_calls) {
        const result = executeTool(call, vfs)
        toolsUsed.push(result.name)
        // Handle async tools (run_code)
        if (result.async && result.result.startsWith('__ASYNC_CODE__')) {
          const code = result.result.slice('__ASYNC_CODE__'.length)
          result.result = await executeRunCode(code)
        }
        toolResults.push(result)
        messages.push({ role: 'tool', content: result.result, tool_call_id: call.id })
      }
      steps.push({ iteration: i + 1, type: 'tool_result', toolResults })
      continue
    }

    const finalResponse = response.content || '(no response)'
    steps.push({ iteration: i + 1, type: 'final', content: finalResponse })
    return { ok: true, steps, finalResponse, model: usedModel, elapsedMs: Date.now() - t0, iterations: i + 1, toolsUsed }
  }

  return { ok: false, steps, finalResponse: '(max iterations reached)', model: usedModel, elapsedMs: Date.now() - t0, iterations: maxIterations, toolsUsed }
}

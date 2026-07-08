// Agent execution route with tool-calling loop.
// Uses the model relay system — user can switch models via /model command.
import { NextResponse } from 'next/server'
import { runAgentLoop, type AgentVFS } from '@/lib/nexus/agent-loop'
import { agentWriteFile, agentReadFile, agentListFiles, getAgentFiles } from '@/lib/nexus/brain'

export const runtime = 'nodejs'
export const maxDuration = 15

const AGENT_PROMPTS: Record<string, string> = {
  'code-agent': 'You are CODE-AGENT, a NEXUS OS implementation specialist. You write clean, working code. When asked to write code, call write_file with the full file content. After writing, summarize what you did in one sentence.',
  'research-agent': 'You are RESEARCH-AGENT. Use read_file and list_files to inspect the filesystem. Provide analysis.',
  'analysis-agent': 'You are ANALYSIS-AGENT. Use read_file and list_files to inspect files. Provide data-driven analysis.',
  'foreman': 'You are FOREMAN. Break tasks into steps. Use write_file to save plans.',
}

export async function POST(req: Request) {
  try {
    const { task, agent } = (await req.json()) as { task?: string; agent?: string }
    if (!task) return NextResponse.json({ error: 'task required' }, { status: 400 })

    const agentName = agent || 'code-agent'
    const systemPrompt = AGENT_PROMPTS[agentName] || AGENT_PROMPTS['code-agent']

    const agentVFS: AgentVFS = {
      readFile: (path: string) => agentReadFile(path),
      writeFile: (path: string, content: string) => { agentWriteFile(path, content); return path },
      listFiles: (_path: string) => agentListFiles(),
    }

    const result = await runAgentLoop(systemPrompt, task, agentVFS)

    return NextResponse.json({
      ...result,
      agent: agentName,
      filesWritten: result.toolsUsed.filter((t) => t === 'write_file').length,
      files: getAgentFiles(),
    })
  } catch (e) {
    return NextResponse.json(
      { error: `agent loop failed: ${(e as Error).message}` },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({ files: getAgentFiles() })
}

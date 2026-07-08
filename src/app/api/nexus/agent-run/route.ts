// Agent execution route — dispatches a task to a specific NEXUS agent.
// Unlike /api/nexus/ask (general Q&A), this route uses agent-specific system
// prompts so the LLM responds IN CHARACTER as that agent.
// POST body: { agent: string, task: string, context?: string }
// Returns: { ok, agent, response, model, elapsedMs }

import { NextResponse } from 'next/server'
import { callZaiDirect } from '@/lib/nexus/zai-shared'
import { getRecentContext, getAgents } from '@/lib/nexus/brain'

export const runtime = 'nodejs'
export const maxDuration = 60

const AGENT_PROMPTS: Record<string, string> = {
  foreman: `You are the FOREMAN agent of NEXUS OS — a coordinator that routes tasks, manages worker assignments, and tracks progress. You are terse, decisive, and action-oriented. When given a task, you break it into sub-tasks and assign them to appropriate workers. Respond with a clear plan and assignments, not prose.`,
  'research-agent': `You are the RESEARCH-AGENT of NEXUS OS — a deep-reasoning specialist. You analyze evidence, summarize papers, and provide structured research findings. You cite sources when possible and distinguish facts from inferences. Be thorough but concise.`,
  'code-agent': `You are the CODE-AGENT of NEXUS OS — an implementation specialist. You write clean, working code. When asked to code, you output the actual code in a code block. When asked to review, you identify bugs and suggest fixes. Be practical and specific.`,
  'analysis-agent': `You are the ANALYSIS-AGENT of NEXUS OS — a data interpretation specialist. You analyze metrics, identify trends, and assess risks. You use numbers and percentages. Be analytical and evidence-based.`,
  'governance-agent': `You are the GOVERNANCE-AGENT of NEXUS OS — a security and compliance specialist. You check actions against the constitution (CR-001..CR-006), verify trust thresholds, and sign VAP entries. Be strict but fair.`,
}

export async function POST(req: Request) {
  try {
    const { agent, task, context } = (await req.json()) as {
      agent?: string
      task?: string
      context?: string
    }

    if (!agent || !task) {
      return NextResponse.json(
        { error: 'agent and task required' },
        { status: 400 },
      )
    }

    // Verify agent exists
    const agents = getAgents()
    const found = agents.find((a) => a.name === agent || a.id === agent)
    if (!found) {
      return NextResponse.json(
        { error: `agent '${agent}' not found. Available: ${agents.map((a) => a.name).join(', ')}` },
        { status: 404 },
      )
    }

    const systemPrompt =
      AGENT_PROMPTS[found.name] ||
      `You are ${found.name}, a NEXUS OS agent with role: ${found.role}. Respond professionally and concisely.`

    const liveContext = getRecentContext()
    const userContent =
      `LIVE NEXUS CONTEXT:\n${liveContext}\n\n` +
      (context ? `ADDITIONAL CONTEXT:\n${context}\n\n` : '') +
      `TASK:\n${task}\n\n` +
      `Execute this task as ${found.name}. Be concise and actionable.`

    const t0 = Date.now()
    const response = await callZaiDirect(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      { maxTokens: 1024, temperature: 0.7 },
    )
    const latencyMs = Date.now() - t0

    return NextResponse.json({
      ok: true,
      agent: found.name,
      agentId: found.id,
      response: response.trim(),
      model: 'GLM-5.2',
      elapsedMs: latencyMs,
      trustAtTime: found.trustScore,
    })
  } catch (e) {
    return NextResponse.json(
      { error: `agent execution failed: ${(e as Error).message}` },
      { status: 500 },
    )
  }
}

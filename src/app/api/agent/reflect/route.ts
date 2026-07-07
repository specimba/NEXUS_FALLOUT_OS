// ============================================================
// NEXUS OS — /api/agent/reflect
//
// Self-reflection endpoint. Body: { task, step, priorSteps? }.
// Asks the LLM whether the current step was successful, with a
// one-paragraph assessment + a recommended next action. Returns
// { ok, reflection: { success, assessment, nextAction } }.
//
// Uses complete() directly (so we can attach a system prompt +
// temperature) from the WAVE-3B dispatch layer.
// ============================================================

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { complete } from '@/lib/nexus/llm'
import { getDefaultModelId } from '@/lib/nexus/models'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function badRequest(message: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: message },
    { status: 400, headers: CORS_HEADERS }
  )
}

export async function OPTIONS(_req: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: any
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body.')
  }

  const task: string = typeof body?.task === 'string' ? body.task.trim() : ''
  const step: string = typeof body?.step === 'string' ? body.step.trim() : ''
  const priorSteps: string[] = Array.isArray(body?.priorSteps)
    ? body.priorSteps.filter((s: any) => typeof s === 'string')
    : []

  if (!task) return badRequest('`task` is required.')
  if (!step) return badRequest('`step` is required.')

  const systemPrompt =
    'You are NEXUS-REFLECT, an agent self-reflection engine. Given the user ' +
    'task, the most recent step the agent took, and any prior steps, you ' +
    'judge whether the step moved toward the goal. Respond ONLY with a ' +
    'strict JSON object — no prose, no fences.'

  const priorBlock =
    priorSteps.length > 0
      ? priorSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '(none)'

  const prompt =
    `TASK:\n${task}\n\n` +
    `PRIOR STEPS:\n${priorBlock}\n\n` +
    `MOST RECENT STEP:\n${step}\n\n` +
    `Reflect on the most recent step. Respond ONLY with JSON in this shape:\n` +
    `{\n  "success": <true|false>,\n  "assessment": "<1-2 sentences>",\n` +
    `  "nextAction": "<one short imperative phrase>"\n}`

  let raw = ''
  try {
    raw = await complete({
      model: getDefaultModelId(),
      messages: [{ role: 'user', content: prompt }],
      systemPrompt,
      temperature: 0.3,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, error: `Reflection LLM call failed: ${message}` },
      { status: 502, headers: CORS_HEADERS }
    )
  }

  // Tolerant JSON parse — strip fences, find first {...} block.
  let parsed: any = null
  if (raw) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const candidate = fenced ? fenced[1] : raw
    try {
      parsed = JSON.parse(candidate.trim())
    } catch {
      const start = candidate.indexOf('{')
      const end = candidate.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(candidate.slice(start, end + 1))
        } catch {
          parsed = null
        }
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return NextResponse.json(
      {
        ok: true,
        reflection: {
          success: false,
          assessment: raw.slice(0, 280) || 'Reflection produced no parseable output.',
          nextAction: 'retry-step',
        },
      },
      { status: 200, headers: CORS_HEADERS }
    )
  }

  return NextResponse.json(
    {
      ok: true,
      reflection: {
        success: Boolean(parsed.success),
        assessment:
          typeof parsed.assessment === 'string'
            ? parsed.assessment
            : 'No assessment provided.',
        nextAction:
          typeof parsed.nextAction === 'string'
            ? parsed.nextAction
            : 'continue',
      },
    },
    { status: 200, headers: CORS_HEADERS }
  )
}

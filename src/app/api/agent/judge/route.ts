// ============================================================
// NEXUS OS — /api/agent/judge
//
// Body: { task, narratives }. Calls judgeNarratives from
// src/lib/nexus/judge.ts (WAVE-3B), which uses askOnce internally
// against the default model. Returns
// { ok, judgment: { winner, reasoning, scores } }.
//
// `scores` is an array of { id, score } (0..100) — matching the
// JudgeVerdict shape exported by WAVE-3B's judge.ts.
// ============================================================

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { judgeNarratives, type NarrativeCandidate } from '@/lib/nexus/judge'

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
  const narrativesRaw: any[] = Array.isArray(body?.narratives) ? body.narratives : []
  const model: string | undefined =
    typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : undefined

  if (!task) return badRequest('`task` is required.')
  if (narrativesRaw.length === 0) {
    return badRequest('`narratives` must be a non-empty array.')
  }

  const candidates: NarrativeCandidate[] = narrativesRaw
    .map((n, i) => {
      if (typeof n === 'string') {
        return { id: `narrative_${i + 1}`, content: n }
      }
      if (n && typeof n === 'object' && typeof n.content === 'string') {
        return {
          id: typeof n.id === 'string' ? n.id : `narrative_${i + 1}`,
          content: n.content,
          ...(typeof n.label === 'string' ? { label: n.label } : {}),
        }
      }
      return null
    })
    .filter((n): n is NarrativeCandidate => n !== null)

  if (candidates.length === 0) {
    return badRequest('No valid narratives after sanitisation.')
  }

  try {
    const judgment = await judgeNarratives(task, candidates, model)
    return NextResponse.json(
      { ok: true, judgment },
      { status: 200, headers: CORS_HEADERS }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, error: `Judge failed: ${message}` },
      { status: 502, headers: CORS_HEADERS }
    )
  }
}

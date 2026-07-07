// ============================================================
// NEXUS OS — /api/hyperbrowser/agent  (POST)
//
// Body: { task: string, model?: string, maxSteps?: number }
//
// Calls Hyperbrowser POST /api/task/hyper-agent with x-api-key auth.
// Reads parsed.jobId (NOT parsed.id — that was the bug).
// Returns { ok, jobId, liveUrl }.
// ============================================================

import { NextRequest } from 'next/server'
import { hbStartAgent } from '@/lib/hyperbrowser'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: { task?: string; model?: string; maxSteps?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json(
      { ok: false, error: 'invalid-json-body' },
      { status: 400 }
    )
  }

  const task = body.task
  if (!task || typeof task !== 'string' || task.trim().length === 0) {
    return Response.json(
      { ok: false, error: 'missing-task' },
      { status: 400 }
    )
  }

  const result = await hbStartAgent({
    task: task.trim(),
    llm: typeof body.model === 'string' && body.model ? body.model : undefined,
    maxSteps:
      typeof body.maxSteps === 'number'
        ? Math.max(1, Math.min(50, Math.floor(body.maxSteps)))
        : undefined,
  })

  if (!result.ok || !result.jobId) {
    return Response.json(
      {
        ok: false,
        error: result.error ?? 'no-job-id-returned',
        status: result.status,
      },
      {
        status: result.status >= 400 && result.status < 600 ? result.status : 502,
      }
    )
  }

  return Response.json({
    ok: true,
    jobId: result.jobId,
    liveUrl: result.liveUrl,
  })
}

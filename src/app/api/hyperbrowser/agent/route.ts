// ============================================================
// NEXUS OS — /api/hyperbrowser/agent  (POST)
//
// Body: { task: string, model?: string, maxSteps?: number }
//
// Calls Hyperbrowser POST /api/task/hyper-agent with x-api-key auth.
// Reads parsed.jobId (NOT parsed.id — that was the bug).
// Returns { ok, jobId, liveUrl }.
//
// CRITICAL: HB's `llm` field only accepts a fixed enum of native model
// ids (gpt-5.5, claude-sonnet-5, gemini-2.5-flash, ...). NEXUS model ids
// are `provider:nativeId` (e.g. `zai:glm-5.2`). For non-HB models we
// OMIT `llm` entirely so HB uses its default — otherwise HB 400s with
// "Invalid enum value".
// ============================================================

import { NextRequest } from 'next/server'
import { hbStartAgent } from '@/lib/hyperbrowser'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Models HB accepts natively in its `llm` enum. */
const HB_ALLOWED_LLM = new Set<string>([
  'gpt-5.5',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4.1',
  'gpt-4.1-mini',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
])

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

  // Resolve the HB-native model id from the NEXUS `provider:nativeId` form.
  // If the caller passes a bare id (no `:`), it's used as-is. We only
  // forward `llm` to HB when the native id is in HB_ALLOWED_LLM; otherwise
  // we omit it entirely and let HB fall back to its default model.
  let hbLlm: string | undefined
  if (typeof body.model === 'string' && body.model.trim()) {
    const nativeId = body.model.includes(':')
      ? body.model.split(':').slice(1).join(':')
      : body.model
    if (HB_ALLOWED_LLM.has(nativeId)) {
      hbLlm = nativeId
    }
  }

  const result = await hbStartAgent({
    task: task.trim(),
    llm: hbLlm,
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

// ============================================================
// NEXUS OS — /api/ai/ask  (one-shot, non-streaming)
//
// POST { prompt, model? }
// Response: { ok, answer, model, latencyMs }
// ============================================================

import { type NextRequest, NextResponse } from 'next/server'
import { askOnce } from '@/lib/nexus/llm'
import { getDefaultModelId } from '@/lib/nexus/models'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface AskBody {
  prompt?: string
  model?: string
}

export async function POST(req: NextRequest) {
  let body: AskBody
  try {
    body = (await req.json()) as AskBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    return NextResponse.json({ ok: false, error: 'prompt is required' }, { status: 400 })
  }

  const model = body.model && body.model.trim() ? body.model.trim() : getDefaultModelId()
  const startedAt = Date.now()

  try {
    const answer = await askOnce(prompt, model)
    return NextResponse.json({
      ok: true,
      answer,
      model,
      latencyMs: Date.now() - startedAt,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, error: message, model, latencyMs: Date.now() - startedAt },
      { status: 500 },
    )
  }
}

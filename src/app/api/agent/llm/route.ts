// ============================================================
// NEXUS OS — /api/agent/llm
//
// Auth-gated LLM gateway. Body: { token, messages, model?, temperature? }.
// Token must match process.env.NEXUS_LLM_GATEWAY_TOKEN → 401 otherwise.
//
// On valid request: calls complete() from src/lib/nexus/llm.ts (the
// WAVE-3B dispatch layer over the 11-provider registry). Returns
// { ok, text, model }. Falls back to an internal fetch against
// /api/ai/ask if the dispatch layer throws.
//
// CORS: Access-Control-Allow-Origin: * + OPTIONS preflight so that
// the Browserless /function sandbox and other remote callers can
// POST back into the gateway.
// ============================================================

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { complete } from '@/lib/nexus/llm'
import { getDefaultModelId } from '@/lib/nexus/models'
import type { ChatMessage } from '@/lib/nexus/types'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function unauthorized(message: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: message },
    { status: 401, headers: CORS_HEADERS }
  )
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
  const expected = process.env.NEXUS_LLM_GATEWAY_TOKEN
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'Gateway token not configured on the server.' },
      { status: 503, headers: CORS_HEADERS }
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body.')
  }

  const token = body?.token
  if (typeof token !== 'string' || token !== expected) {
    return unauthorized('Invalid gateway token.')
  }

  const messagesRaw = body?.messages
  if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
    return badRequest('`messages` must be a non-empty array.')
  }

  const messages: ChatMessage[] = messagesRaw
    .filter((m: any) => m && typeof m === 'object' && typeof m.content === 'string')
    .map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: m.content,
    }))

  if (messages.length === 0) {
    return badRequest('No valid messages after sanitisation.')
  }

  const model: string = typeof body?.model === 'string' && body.model.trim()
    ? body.model.trim()
    : getDefaultModelId()
  const temperature: number | undefined =
    typeof body?.temperature === 'number' ? body.temperature : undefined
  const systemPrompt: string | undefined =
    typeof body?.systemPrompt === 'string' && body.systemPrompt.trim()
      ? body.systemPrompt.trim()
      : undefined

  const started = Date.now()
  try {
    const text = await complete({ model, messages, temperature, systemPrompt })
    return NextResponse.json(
      { ok: true, text, model, latencyMs: Date.now() - started },
      { status: 200, headers: CORS_HEADERS }
    )
  } catch (err) {
    // Fallback: try the internal /api/ai/ask route (if present from
    // another wave). This keeps the gateway usable when a provider
    // is misbehaving or unavailable.
    try {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      if (lastUser) {
        const baseUrl = process.env.NEXUS_PUBLIC_BASE_URL || ''
        const url = baseUrl
          ? `${baseUrl.replace(/\/$/, '')}/api/ai/ask`
          : '/api/ai/ask'
        const fallback = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: lastUser.content, model }),
        })
        if (fallback.ok) {
          const data = await fallback.json()
          const text: string =
            data?.text ?? data?.answer ?? data?.content ?? ''
          if (text) {
            return NextResponse.json(
              { ok: true, text, model, fallback: true, latencyMs: Date.now() - started },
              { status: 200, headers: CORS_HEADERS }
            )
          }
        }
      }
    } catch {
      /* fall through to error */
    }

    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, error: `LLM completion failed: ${message}` },
      { status: 502, headers: CORS_HEADERS }
    )
  }
}

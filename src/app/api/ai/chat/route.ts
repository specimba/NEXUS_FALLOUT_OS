// ============================================================
// NEXUS OS — /api/ai/chat  (streaming SSE)
//
// POST { messages, model?, temperature?, systemPrompt? }
// Response: text/event-stream
//   data: {"delta":"<chunk>"}\n\n   per token
//   data: {"error":"<msg>"}\n\n     on error
//   data: [DONE]\n\n                at end
// ============================================================

import { type NextRequest } from 'next/server'
import type { ChatMessage } from '@/lib/nexus/types'
import { streamComplete } from '@/lib/nexus/llm'
import { getDefaultModelId } from '@/lib/nexus/models'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ChatBody {
  messages?: ChatMessage[]
  model?: string
  temperature?: number
  systemPrompt?: string
}

export async function POST(req: NextRequest) {
  let body: ChatBody
  try {
    body = (await req.json()) as ChatBody
  } catch {
    return jsonError(400, 'Invalid JSON body')
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) {
    return jsonError(400, 'messages[] is required')
  }

  const model = body.model && body.model.trim() ? body.model.trim() : getDefaultModelId()
  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.7
  const systemPrompt = body.systemPrompt

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }
      try {
        const gen = streamComplete({ model, messages, temperature, systemPrompt })
        for await (const delta of gen) {
          if (delta) send({ delta })
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        send({ error: msg })
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

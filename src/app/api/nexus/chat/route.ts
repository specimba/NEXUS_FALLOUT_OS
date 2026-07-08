import { NextRequest, NextResponse } from 'next/server'
import { getModel, getProvider } from '@/lib/nexus/providers'
import type { ProviderId } from '@/lib/nexus/providers/types'

// POST /api/nexus/chat — OpenAI-compatible chat relay.
//
// Body: { model: string, messages: [{role, content}], maxTokens?, temperature? }
//
// Refuses to relay if the selected model's provider is marked `blocked`.
// Otherwise proxies to the provider's baseUrl + /chat/completions with the
// provider's API key from process.env.

interface ChatBody {
  model: string
  messages: { role: string; content: string }[]
  maxTokens?: number
  temperature?: number
}

export async function POST(req: NextRequest) {
  let body: ChatBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { model: modelId, messages, maxTokens, temperature } = body
  if (!modelId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'model and messages are required' }, { status: 400 })
  }

  const model = getModel(modelId)
  if (!model) {
    return NextResponse.json({ error: `unknown model: ${modelId}` }, { status: 404 })
  }

  if (model.providerBlocked || !model.providerAvailable) {
    return NextResponse.json(
      {
        error: `provider ${model.providerName} is blocked`,
        blockedReason: model.providerBlockedReason ?? 'unavailable',
      },
      { status: 503 },
    )
  }

  const provider = getProvider(model.providerId as ProviderId)
  if (!provider) {
    return NextResponse.json({ error: 'provider not found' }, { status: 500 })
  }

  const apiKey = process.env[provider.apiKeyEnv]
  if (!apiKey) {
    return NextResponse.json(
      { error: `API key not configured (${provider.apiKeyEnv})` },
      { status: 503 },
    )
  }

  const payload: Record<string, unknown> = {
    model: model.model,
    messages,
    max_tokens: maxTokens ?? 1024,
    temperature: temperature ?? 0.7,
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://nexus-os.dev'
    headers['X-Title'] = 'NEXUS OS'
  }

  try {
    const upstream = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '')
      return NextResponse.json(
        {
          error: `${model.name} upstream ${upstream.status}`,
          detail: txt.slice(0, 400),
        },
        { status: upstream.status },
      )
    }

    const data = await upstream.json()
    const msg = data?.choices?.[0]?.message
    return NextResponse.json({
      content: msg?.content ?? '',
      tool_calls: msg?.tool_calls,
      model: model.id,
      provider: provider.id,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'upstream fetch failed', detail: msg }, { status: 502 })
  }
}

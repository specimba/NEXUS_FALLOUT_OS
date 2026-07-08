import { NextResponse } from 'next/server'
import { getRecentContext } from '@/lib/nexus/brain'
import { callZaiDirect } from '@/lib/nexus/zai-shared'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { question?: string }
    const question = (body.question || '').trim()
    if (!question) {
      return NextResponse.json({ error: 'question required' }, { status: 400 })
    }
    const ctx = getRecentContext()
    const systemPrompt = [
      'You are NEXUS OS, an in-browser governance assistant for a fictional AI-OS terminal.',
      'Answer the user concisely (3-6 sentences) using the provided context as your source of truth.',
      'If the question is unrelated to NEXUS, briefly say so and offer to summarize NEXUS state instead.',
      'Refer to agents, pools, the governor, and the vault by name when relevant.',
      '',
      'Current NEXUS context (JSON):',
      JSON.stringify(ctx),
    ].join('\n')

    const t0 = Date.now()
    const answer = await callZaiDirect(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      { temperature: 0.4, maxTokens: 200 }
    )
    return NextResponse.json({
      answer,
      model: 'GLM-5.2',
      modelId: 'glm-5.2',
      elapsedMs: Date.now() - t0,
      ts: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

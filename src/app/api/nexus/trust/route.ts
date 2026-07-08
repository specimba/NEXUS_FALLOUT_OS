import { NextResponse } from 'next/server'
import { getTrust, getAgent } from '@/lib/nexus/brain'

export async function GET(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 120))
    const url = new URL(req.url)
    const agent = url.searchParams.get('agent') || undefined
    return NextResponse.json(getTrust(agent))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 150))
    const body = (await req.json().catch(() => ({}))) as {
      agent?: string
      delta?: number
      reason?: string
    }
    if (!body.agent || typeof body.delta !== 'number') {
      return NextResponse.json({ error: 'agent and delta (number) required' }, { status: 400 })
    }
    const a = getAgent(body.agent)
    if (!a) return NextResponse.json({ error: 'no such agent' }, { status: 404 })
    const newScore = Math.max(0, Math.min(1, Number((a.trustScore + body.delta).toFixed(3))))
    return NextResponse.json({
      ok: true,
      agent: a.name,
      delta: body.delta,
      oldScore: a.trustScore,
      newScore,
      reason: body.reason || 'manual trust-update',
      vapHash: Math.random().toString(16).slice(2, 10),
      ts: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

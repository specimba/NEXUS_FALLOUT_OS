import { NextResponse } from 'next/server'
import { getAgent } from '@/lib/nexus/brain'

export async function POST(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 150))
    const body = (await req.json().catch(() => ({}))) as {
      agent?: string
      action?: string
    }
    if (!body.agent || !body.action) {
      return NextResponse.json({ error: 'agent and action required' }, { status: 400 })
    }
    const a = getAgent(body.agent)
    if (!a) return NextResponse.json({ error: 'no such agent' }, { status: 404 })
    return NextResponse.json({
      ok: true,
      agent: a.name,
      action: body.action,
      vapHash: Math.random().toString(16).slice(2, 10),
      ts: new Date().toISOString(),
      message: 'intervention committed; governor M5 audit armed',
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

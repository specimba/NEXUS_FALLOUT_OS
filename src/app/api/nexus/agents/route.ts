import { NextResponse } from 'next/server'
import { getAgents, getAgent } from '@/lib/nexus/brain'

export async function GET(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 120))
    const url = new URL(req.url)
    const name = url.searchParams.get('name')
    if (name) {
      const a = getAgent(name)
      if (!a) return NextResponse.json({ error: 'no such agent' }, { status: 404 })
      return NextResponse.json(a)
    }
    return NextResponse.json({ agents: getAgents() })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 150))
    const body = (await req.json().catch(() => ({}))) as {
      action?: string
      name?: string
      domain?: string
      role?: string
    }
    if (body.action !== 'spawn' || !body.name || !body.domain) {
      return NextResponse.json({ error: 'action=spawn, name, domain required' }, { status: 400 })
    }
    return NextResponse.json({
      ok: true,
      action: 'spawn',
      agent: { name: body.name, domain: body.domain, role: body.role || 'worker', status: 'busy', trustScore: 0.5 },
      vapHash: Math.random().toString(16).slice(2, 10),
      ts: new Date().toISOString(),
      message: 'agent spawned; governor M3 review pending',
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

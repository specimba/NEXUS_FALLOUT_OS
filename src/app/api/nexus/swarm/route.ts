import { NextResponse } from 'next/server'
import { getSwarm } from '@/lib/nexus/brain'

export async function GET() {
  try {
    await new Promise((r) => setTimeout(r, 120))
    return NextResponse.json(getSwarm())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 150))
    const body = (await req.json().catch(() => ({}))) as {
      action?: string
      from?: string
      to?: string
      worker?: string
      domain?: string
    }
    if (!body.action) {
      return NextResponse.json({ error: 'action required (dispatch|probe|handoff)' }, { status: 400 })
    }
    if (body.action === 'handoff') {
      if (!body.from || !body.to) return NextResponse.json({ error: 'from and to required for handoff' }, { status: 400 })
      return NextResponse.json({
        ok: true,
        action: 'handoff',
        from: body.from,
        to: body.to,
        vapHash: Math.random().toString(16).slice(2, 10),
        ts: new Date().toISOString(),
        message: 'handoff committed; tasks re-routed',
      })
    }
    if (body.action === 'dispatch') {
      return NextResponse.json({
        ok: true,
        action: 'dispatch',
        worker: body.worker || 'w-alpha',
        domain: body.domain || 'code',
        taskId: 'T-' + Math.random().toString(16).slice(2, 8),
        vapHash: Math.random().toString(16).slice(2, 10),
        ts: new Date().toISOString(),
      })
    }
    if (body.action === 'probe') {
      return NextResponse.json({
        ok: true,
        action: 'probe',
        worker: body.worker || 'w-beta',
        latencyMs: 420 + Math.floor(Math.random() * 200),
        healthy: true,
        ts: new Date().toISOString(),
      })
    }
    return NextResponse.json({ error: 'unknown action: ' + body.action }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

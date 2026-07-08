import { NextResponse } from 'next/server'
import { getGovernor } from '@/lib/nexus/brain'

export async function GET() {
  try {
    await new Promise((r) => setTimeout(r, 120))
    return NextResponse.json(getGovernor())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 150))
    const body = (await req.json().catch(() => ({}))) as {
      action?: string
      decisionId?: string
      rationale?: string
    }
    if (body.action !== 'appeal' || !body.decisionId) {
      return NextResponse.json({ error: 'action=appeal, decisionId required' }, { status: 400 })
    }
    return NextResponse.json({
      ok: true,
      action: 'appeal',
      decisionId: body.decisionId,
      newState: 'REVIEW',
      vapHash: Math.random().toString(16).slice(2, 10),
      ts: new Date().toISOString(),
      message: 'appeal queued; governor will re-decide within 60s',
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getProposals } from '@/lib/nexus/brain'

export async function GET() {
  try {
    await new Promise((r) => setTimeout(r, 120))
    return NextResponse.json({ proposals: getProposals() })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 150))
    const body = (await req.json().catch(() => ({}))) as {
      action?: string
      id?: string
      title?: string
      proposer?: string
    }
    if (!body.action) return NextResponse.json({ error: 'action required (create|approve|reject)' }, { status: 400 })
    if (body.action === 'create') {
      if (!body.title) return NextResponse.json({ error: 'title required for create' }, { status: 400 })
      return NextResponse.json({
        ok: true,
        action: 'create',
        proposal: {
          id: 'PR-' + Math.random().toString(16).slice(2, 8),
          title: body.title,
          proposer: body.proposer || 'user',
          state: 'open',
          votesFor: 1,
          votesAgainst: 0,
          quorum: 5,
          ts: new Date().toISOString(),
        },
        vapHash: Math.random().toString(16).slice(2, 10),
        ts: new Date().toISOString(),
      })
    }
    if (body.action === 'approve' || body.action === 'reject') {
      if (!body.id) return NextResponse.json({ error: 'id required for ' + body.action }, { status: 400 })
      return NextResponse.json({
        ok: true,
        action: body.action,
        id: body.id,
        newState: body.action === 'approve' ? 'approved' : 'rejected',
        vapHash: Math.random().toString(16).slice(2, 10),
        ts: new Date().toISOString(),
      })
    }
    return NextResponse.json({ error: 'unknown action: ' + body.action }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

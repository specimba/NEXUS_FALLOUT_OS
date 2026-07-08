import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 150))
    const body = (await req.json().catch(() => ({}))) as { target?: string }
    const target = body.target || 'swarm'
    return NextResponse.json({
      ok: true,
      halted: target,
      vapHash: Math.random().toString(16).slice(2, 10),
      ts: new Date().toISOString(),
      message: target === 'swarm' ? 'swarm halted; all workers idle' : 'agent halted; tasks re-routed',
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

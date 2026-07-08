import { NextResponse } from 'next/server'
import { getDrillScoreboard, runDrill } from '@/lib/nexus/brain'

export async function GET() {
  try {
    await new Promise((r) => setTimeout(r, 120))
    return NextResponse.json(getDrillScoreboard())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 180))
    const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string }
    if (body.action !== 'run' || !body.id) {
      return NextResponse.json({ error: 'action=run, id required' }, { status: 400 })
    }
    const res = runDrill(body.id)
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: 404 })
    return NextResponse.json({
      ok: true,
      ...res,
      vapHash: Math.random().toString(16).slice(2, 10),
      ts: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

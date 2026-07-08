import { NextResponse } from 'next/server'
import { getVap } from '@/lib/nexus/brain'

export async function GET() {
  try {
    await new Promise((r) => setTimeout(r, 120))
    return NextResponse.json({ entries: getVap() })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 150))
    const body = (await req.json().catch(() => ({}))) as { action?: string }
    if (body.action !== 'verify') {
      return NextResponse.json({ error: 'action=verify required' }, { status: 400 })
    }
    const entries = getVap()
    const intact = entries.every((e, i) => i === 0 || e.prevHash === entries[i - 1].hash)
    return NextResponse.json({
      ok: true,
      action: 'verify',
      chain: intact ? 'INTACT' : 'BROKEN',
      length: entries.length,
      head: entries.length ? entries[entries.length - 1].hash : null,
      ts: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

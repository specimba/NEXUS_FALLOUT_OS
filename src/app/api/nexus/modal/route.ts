import { NextResponse } from 'next/server'
import { getModalStatus } from '@/lib/nexus/brain'

export async function GET() {
  try {
    await new Promise((r) => setTimeout(r, 120))
    return NextResponse.json(getModalStatus())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 150))
    const body = (await req.json().catch(() => ({}))) as { action?: string }
    if (body.action !== 'run') {
      return NextResponse.json({ error: 'action=run required' }, { status: 400 })
    }
    return NextResponse.json({
      ok: true,
      action: 'run',
      modal: getModalStatus(),
      ts: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getLogs } from '@/lib/nexus/brain'

export async function GET(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 120))
    const url = new URL(req.url)
    const limitStr = url.searchParams.get('limit')
    const limit = limitStr ? parseInt(limitStr, 10) || undefined : undefined
    return NextResponse.json({ logs: getLogs(limit) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

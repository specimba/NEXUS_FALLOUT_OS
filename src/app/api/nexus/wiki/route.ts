import { NextResponse } from 'next/server'
import { getWiki } from '@/lib/nexus/brain'

export async function GET(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 120))
    const url = new URL(req.url)
    const q = url.searchParams.get('q') || undefined
    const source = (url.searchParams.get('source') || undefined) as
      | 'vault'
      | 'governor'
      | 'swarm'
      | 'brain'
      | undefined
    return NextResponse.json({ pages: getWiki(q, source) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getVault, type VaultTrack } from '@/lib/nexus/brain'

export async function GET(req: Request) {
  try {
    await new Promise((r) => setTimeout(r, 120))
    const url = new URL(req.url)
    const track = (url.searchParams.get('track') || undefined) as VaultTrack | undefined
    return NextResponse.json(getVault(track))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getConstitution } from '@/lib/nexus/brain'

export async function GET() {
  try {
    await new Promise((r) => setTimeout(r, 120))
    return NextResponse.json(getConstitution())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

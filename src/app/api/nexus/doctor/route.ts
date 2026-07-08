import { NextResponse } from 'next/server'
import { getDoctor } from '@/lib/nexus/brain'

export async function GET() {
  try {
    await new Promise((r) => setTimeout(r, 120))
    return NextResponse.json(getDoctor())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

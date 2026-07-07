// ============================================================
// NEXUS OS — /api/hyperbrowser/search  (POST)
//
// Body: { query: string }
//
// Calls Hyperbrowser POST /api/web/search with x-api-key auth.
// Returns the upstream results array (real, not synthesized).
// ============================================================

import { NextRequest } from 'next/server'
import { hbSearch } from '@/lib/hyperbrowser'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: { query?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json(
      { ok: false, error: 'invalid-json-body' },
      { status: 400 }
    )
  }

  const query = body.query
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return Response.json(
      { ok: false, error: 'missing-query' },
      { status: 400 }
    )
  }

  const result = await hbSearch(query.trim())

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error, status: result.status },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 }
    )
  }

  // HB /api/web/search returns { results: [...] } (or sometimes a bare
  // array). Pass both shapes through to the client.
  const raw = result.data as Record<string, unknown> | null
  const results =
    raw && Array.isArray(raw.results)
      ? raw.results
      : Array.isArray(raw)
        ? raw
        : []

  return Response.json({ ok: true, results, raw: raw ?? null })
}

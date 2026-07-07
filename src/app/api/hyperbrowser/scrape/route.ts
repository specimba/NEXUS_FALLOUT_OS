// ============================================================
// NEXUS OS — /api/hyperbrowser/scrape  (POST)
//
// Body: { url: string }
//
// Calls Hyperbrowser POST /api/web/fetch with x-api-key auth.
// Returns { ok, data:{ markdown, html } }.
// NEVER synthetic — on error returns the real Hyperbrowser error.
// ============================================================

import { NextRequest } from 'next/server'
import { hbScrape } from '@/lib/hyperbrowser'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: { url?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json(
      { ok: false, error: 'invalid-json-body' },
      { status: 400 }
    )
  }

  const url = body.url
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return Response.json(
      { ok: false, error: 'missing-or-invalid-url' },
      { status: 400 }
    )
  }

  const result = await hbScrape(url)

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error, status: result.status },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 }
    )
  }

  // HB /api/web/fetch returns { jobId, status, data:{ markdown, html } }.
  // Normalise into { ok, data:{ markdown, html } }.
  const raw = result.data as Record<string, unknown> | null
  const data =
    raw && typeof raw === 'object' && 'data' in raw
      ? (raw.data as Record<string, unknown> | undefined)
      : (raw ?? undefined)

  return Response.json({
    ok: true,
    data: {
      markdown:
        (data && typeof data.markdown === 'string' && data.markdown) || '',
      html: (data && typeof data.html === 'string' && data.html) || '',
      raw: raw ?? null,
    },
  })
}

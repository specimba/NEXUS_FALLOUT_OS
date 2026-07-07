// ============================================================
// NEXUS OS — /api/browserless  (POST)
//
// Body: { endpoint: string, payload: Record<string, unknown> }
//
// Streams the upstream Browserless response back to the caller with the
// original content-type preserved (so images, PDFs, HTML, and JSON all
// flow through correctly).
// ============================================================

import { NextRequest } from 'next/server'
import { callBrowserless } from '@/lib/browserless'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: { endpoint?: string; payload?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return Response.json(
      { ok: false, error: 'invalid-json-body' },
      { status: 400 }
    )
  }

  const endpoint = body.endpoint
  if (!endpoint || typeof endpoint !== 'string') {
    return Response.json(
      { ok: false, error: 'missing-endpoint' },
      { status: 400 }
    )
  }

  const payload =
    body.payload && typeof body.payload === 'object'
      ? (body.payload as Record<string, unknown>)
      : {}

  const upstream = await callBrowserless(endpoint, payload)

  // Stream the upstream body through with the original content-type.
  const respHeaders = new Headers()
  const ct = upstream.headers.get('content-type')
  if (ct) respHeaders.set('content-type', ct)
  const cl = upstream.headers.get('content-length')
  if (cl) respHeaders.set('content-length', cl)

  if (!upstream.ok) {
    // Forward the error body verbatim — never synthesize.
    const errText = await upstream.text()
    return new Response(errText, {
      status: upstream.status,
      headers: respHeaders,
    })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  })
}

export async function GET() {
  return Response.json({
    ok: true,
    service: 'browserless',
    endpoints: ['content', 'scrape', 'screenshot', 'pdf', 'search', 'function'],
  })
}

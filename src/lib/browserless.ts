// ============================================================
// NEXUS OS — Browserless server-only client
//
// Base URL: https://production-sfo.browserless.io  (production-sfo)
// Auth: ?token=<BROWSERLESS_TOKEN> query param.
//
// Special cases (CRITICAL — these were learned the hard way):
//   • /content  → forward ONLY {url}. Strip raw/options/everything else
//                 or BL returns HTTP 400.
//   • /scrape   → build {url, elements:[{selector}]} (selector defaults
//                 to 'body' if caller didn't supply one).
//   • /screenshot → forward {url, options:{fullPage:true, type:'png'}}.
//   • /search   → forward {query}.
//   • everything else (pdf, function, …) → pass-through payload as-is.
//
// Returns the RAW upstream Response so the caller can stream bytes,
// preserve content-type, or parse JSON as needed. NEVER fabricate data —
// on missing token we return a real 500 error response.
// ============================================================

import 'server-only'

const BL_BASE = 'https://production-sfo.browserless.io'

function tokenQuery(): string {
  const t = process.env.BROWSERLESS_TOKEN
  if (!t) return ''
  return `?token=${encodeURIComponent(t)}`
}

/**
 * Call a Browserless endpoint. Returns the raw upstream Response.
 *
 * Special-cases the endpoints documented above so callers can pass a
 * natural payload and we sanitize it into BL's exact expected shape.
 */
export async function callBrowserless(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<Response> {
  const token = process.env.BROWSERLESS_TOKEN
  if (!token) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'BROWSERLESS_TOKEN not configured',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    )
  }

  // Normalise endpoint (strip leading slash).
  const ep = endpoint.replace(/^\/+/, '')

  // Build the request body per-endpoint.
  let body: Record<string, unknown>

  switch (ep) {
    case 'content':
      // CRITICAL: BL /content rejects any field other than {url}.
      // Strip raw/options/selector/everything else.
      body = { url: payload.url }
      break

    case 'scrape':
      // BL /scrape requires {url, elements:[{selector}]}.
      body = {
        url: payload.url,
        elements: [
          { selector: (payload.selector as string | undefined) ?? 'body' },
        ],
      }
      break

    case 'screenshot':
      body = {
        url: payload.url,
        options: { fullPage: true, type: 'png' },
      }
      break

    case 'search':
      body = { query: payload.query }
      break

    default:
      // pdf, function, etc. — pass-through.
      body = payload
      break
  }

  const url = `${BL_BASE}/${ep}${tokenQuery()}`
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-cache',
      accept: 'application/json, image/*, application/pdf, */*',
    },
    body: JSON.stringify(body),
  })
}

export { BL_BASE }

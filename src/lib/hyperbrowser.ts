// ============================================================
// NEXUS OS — Hyperbrowser server-only client
//
// Base URL: https://api.hyperbrowser.ai  (NO /v1 — that 404s).
// Auth header: x-api-key: <HYPERBROWSER_API_KEY>.
//
// Endpoints used by NEXUS OS:
//   • POST /api/web/fetch            {url}              → {jobId, data:{markdown, html}}
//   • POST /api/web/search           {query}            → results
//   • POST /api/task/hyper-agent     {task, llm?, maxSteps?}  → {jobId, liveUrl}
//   • GET  /api/task/hyper-agent/{id}                   → {status, data:{steps, finalResult}}
//
// NEVER return synthetic data — on error, return the real error.
// ============================================================

import 'server-only'

export const HB_BASE = 'https://api.hyperbrowser.ai'

function apiKey(): string | null {
  const k = process.env.HYPERBROWSER_API_KEY
  return k && k.length > 0 ? k : null
}

/**
 * Low-level helper: call a Hyperbrowser path with x-api-key auth.
 * Returns the raw upstream Response.
 *
 * `path` MUST start with `/` (e.g. "/api/web/fetch"). NEVER include
 * "/v1" — the Hyperbrowser base URL has no version prefix and adding
 * one returns 404.
 */
export async function callHB(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const key = apiKey()
  if (!key) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'HYPERBROWSER_API_KEY not configured',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    )
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = `${HB_BASE}${cleanPath}`

  const headers = new Headers(init?.headers)
  headers.set('x-api-key', key)
  // Default JSON content-type for POSTs that have a body.
  if (init?.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  headers.set('accept', 'application/json, */*')

  return fetch(url, { ...init, headers })
}

/**
 * POST /api/web/fetch — scrape a single URL to markdown + html.
 * Returns the parsed JSON object from Hyperbrowser (no synthetic data).
 */
export async function hbScrape(
  url: string
): Promise<{ ok: boolean; data?: unknown; error?: string; status: number }> {
  const res = await callHB('/api/web/fetch', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        (parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as Record<string, unknown>).error)
          : text) || `Hyperbrowser fetch failed (${res.status})`,
    }
  }
  return { ok: true, status: res.status, data: parsed }
}

/**
 * POST /api/web/search — search the web.
 */
export async function hbSearch(
  query: string
): Promise<{ ok: boolean; data?: unknown; error?: string; status: number }> {
  const res = await callHB('/api/web/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        (parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as Record<string, unknown>).error)
          : text) || `Hyperbrowser search failed (${res.status})`,
    }
  }
  return { ok: true, status: res.status, data: parsed }
}

/**
 * POST /api/task/hyper-agent — start an agentic browser task.
 * Returns {jobId, liveUrl}. NOTE: read parsed.jobId, NOT parsed.id.
 */
export async function hbStartAgent(opts: {
  task: string
  llm?: string
  maxSteps?: number
}): Promise<{
  ok: boolean
  jobId?: string
  liveUrl?: string
  error?: string
  status: number
}> {
  const body: Record<string, unknown> = { task: opts.task }
  if (opts.llm) body.llm = opts.llm
  if (typeof opts.maxSteps === 'number') body.maxSteps = opts.maxSteps

  const res = await callHB('/api/task/hyper-agent', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        (parsed && 'error' in parsed
          ? String(parsed.error)
          : text) || `Hyperbrowser agent start failed (${res.status})`,
    }
  }
  // CRITICAL: jobId, not id.
  const jobId =
    parsed && typeof parsed === 'object'
      ? (parsed.jobId as string | undefined) ??
        (parsed.id as string | undefined) // fallback, but prefer jobId
      : undefined
  const liveUrl =
    parsed && typeof parsed === 'object'
      ? (parsed.liveUrl as string | undefined)
      : undefined
  return { ok: true, status: res.status, jobId, liveUrl }
}

/**
 * GET /api/task/hyper-agent/{id} — poll an agentic task.
 * Returns the raw parsed response so callers can map the HB step shape.
 */
export async function hbPollAgent(
  jobId: string
): Promise<{ ok: boolean; data?: unknown; error?: string; status: number }> {
  const res = await callHB(
    `/api/task/hyper-agent/${encodeURIComponent(jobId)}`,
    { method: 'GET' }
  )
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        (parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as Record<string, unknown>).error)
          : text) || `Hyperbrowser agent poll failed (${res.status})`,
    }
  }
  return { ok: true, status: res.status, data: parsed }
}

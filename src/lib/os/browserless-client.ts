// ============================================================
// NEXUS OS — Browserless client helpers (browser-side)
//
// Thin wrappers around POST /api/browserless that return typed data.
// Used by the Browser app. All errors are propagated as { ok:false,
// error } — never synthetic.
// ============================================================

export type BLContentResult = {
  ok: boolean
  html?: string
  error?: string
  status?: number
}

export type BLScrapeResult = {
  ok: boolean
  results?: Array<{ selector: string; results: Array<Record<string, unknown>> }>
  error?: string
  status?: number
}

export type BLScreenshotResult = {
  ok: boolean
  blobUrl?: string
  blob?: Blob
  error?: string
  status?: number
}

export type BLPdfResult = {
  ok: boolean
  blobUrl?: string
  blob?: Blob
  error?: string
  status?: number
}

export type BLSearchResult = {
  ok: boolean
  results?: Array<{ title?: string; url?: string; snippet?: string; [k: string]: unknown }>
  error?: string
  status?: number
}

export type BLAgentResult = {
  ok: boolean
  narratives?: Array<{
    ok: boolean
    strategy: string
    narrative: string
    steps?: Array<{ label: string; detail: string; ts?: number }>
    finalUrl?: string
    error?: string
  }>
  judgment?: unknown
  error?: string
  status?: number
}

async function postJSON(endpoint: string, payload: Record<string, unknown>) {
  return fetch('/api/browserless', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint, payload }),
  })
}

/** POST /api/browserless {endpoint:'content'} → HTML string. */
export async function fetchContent(url: string): Promise<BLContentResult> {
  try {
    const r = await postJSON('content', { url })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      return { ok: false, error: text || `content-${r.status}`, status: r.status }
    }
    const ct = r.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const j = await r.json().catch(() => null)
      const html =
        j && typeof j === 'object' && 'data' in j
          ? String((j as Record<string, unknown>).data ?? '')
          : typeof j === 'string'
            ? j
            : ''
      return { ok: true, html }
    }
    const html = await r.text()
    return { ok: true, html }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** POST /api/browserless {endpoint:'scrape'} → selector results. */
export async function scrape(
  url: string,
  selector = 'body'
): Promise<BLScrapeResult> {
  try {
    const r = await postJSON('scrape', { url, selector })
    const text = await r.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error:
          (parsed && typeof parsed === 'object' && 'error' in parsed
            ? String((parsed as Record<string, unknown>).error)
            : text) || `scrape-${r.status}`,
      }
    }
    const data =
      parsed && typeof parsed === 'object' && 'data' in parsed
        ? (parsed as Record<string, unknown>).data
        : parsed
    const results =
      data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).results)
        ? (data as Record<string, unknown>).results as BLScrapeResult['results']
        : Array.isArray(data)
          ? (data as BLScrapeResult['results'])
          : []
    return { ok: true, results }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** POST /api/browserless {endpoint:'screenshot'} → PNG blob URL. */
export async function screenshot(url: string): Promise<BLScreenshotResult> {
  try {
    const r = await postJSON('screenshot', { url })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      return { ok: false, status: r.status, error: text || `screenshot-${r.status}` }
    }
    const blob = await r.blob()
    if (!blob || blob.size === 0) {
      return { ok: false, error: 'empty-screenshot-blob' }
    }
    const blobUrl = URL.createObjectURL(blob)
    return { ok: true, blobUrl, blob }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** POST /api/browserless {endpoint:'pdf'} → PDF blob URL. */
export async function fetchPdf(url: string): Promise<BLPdfResult> {
  try {
    const r = await postJSON('pdf', { url, options: { format: 'A4', printBackground: true } })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      return { ok: false, status: r.status, error: text || `pdf-${r.status}` }
    }
    const blob = await r.blob()
    if (!blob || blob.size === 0) {
      return { ok: false, error: 'empty-pdf-blob' }
    }
    const blobUrl = URL.createObjectURL(blob)
    return { ok: true, blobUrl, blob }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** POST /api/browserless {endpoint:'search'} → results list. */
export async function search(query: string): Promise<BLSearchResult> {
  try {
    const r = await postJSON('search', { query })
    const text = await r.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error:
          (parsed && typeof parsed === 'object' && 'error' in parsed
            ? String((parsed as Record<string, unknown>).error)
            : text) || `search-${r.status}`,
      }
    }
    // BL /search returns { results: [{ title, url, snippet }, ...] } OR
    // { organicResults: [...] }. Support both.
    const obj =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    const results = (
      Array.isArray(obj.results)
        ? obj.results
        : Array.isArray(obj.organicResults)
          ? obj.organicResults
          : Array.isArray(obj.data)
            ? obj.data
            : []
    ) as BLSearchResult['results']
    return { ok: true, results }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** POST /api/browserless/agent {task, n, maxSteps} → BoN narratives + judgment. */
export async function runAgent(
  task: string,
  opts: { n?: number; maxSteps?: number } = {}
): Promise<BLAgentResult> {
  try {
    const r = await fetch('/api/browserless/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task,
        n: opts.n,
        maxSteps: opts.maxSteps,
      }),
    })
    const text = await r.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error:
          (parsed && typeof parsed === 'object' && 'error' in parsed
            ? String((parsed as Record<string, unknown>).error)
            : text) || `agent-${r.status}`,
      }
    }
    const obj =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    return {
      ok: Boolean(obj.ok ?? true),
      narratives: Array.isArray(obj.narratives)
        ? (obj.narratives as BLAgentResult['narratives'])
        : [],
      judgment: obj.judgment ?? null,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

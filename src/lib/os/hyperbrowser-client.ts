// ============================================================
// NEXUS OS — Hyperbrowser client helpers (browser-side)
//
// Thin wrappers around /api/hyperbrowser/* routes. Returns typed data.
// Used by the Browser app. All errors propagated — never synthetic.
// ============================================================

export type HBScrapeResult = {
  ok: boolean
  markdown?: string
  html?: string
  raw?: unknown
  error?: string
  status?: number
}

export type HBSearchResultItem = {
  title?: string
  url?: string
  link?: string
  snippet?: string
  description?: string
  [k: string]: unknown
}

export type HBSearchResult = {
  ok: boolean
  results?: HBSearchResultItem[]
  raw?: unknown
  error?: string
  status?: number
}

export type HBStartAgentResult = {
  ok: boolean
  jobId?: string
  liveUrl?: string
  error?: string
  status?: number
}

export type HBPollStep = {
  index: number
  thoughts: string
  actions: string[]
  raw?: unknown
}

export type HBPollAgentResult = {
  ok: boolean
  status?: string
  steps?: HBPollStep[]
  finalResult?: string
  liveUrl?: string
  error?: string
  raw?: unknown
}

/** POST /api/hyperbrowser/scrape {url} → { markdown, html }. */
export async function hbScrape(url: string): Promise<HBScrapeResult> {
  try {
    const r = await fetch('/api/hyperbrowser/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
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
            : text) || `hb-scrape-${r.status}`,
      }
    }
    const obj =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    const data =
      obj.data && typeof obj.data === 'object'
        ? (obj.data as Record<string, unknown>)
        : {}
    return {
      ok: true,
      markdown: typeof data.markdown === 'string' ? data.markdown : '',
      html: typeof data.html === 'string' ? data.html : '',
      raw: obj.raw ?? obj,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** POST /api/hyperbrowser/search {query} → results[]. */
export async function hbSearch(query: string): Promise<HBSearchResult> {
  try {
    const r = await fetch('/api/hyperbrowser/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
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
            : text) || `hb-search-${r.status}`,
      }
    }
    const obj =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    return {
      ok: true,
      results: Array.isArray(obj.results)
        ? (obj.results as HBSearchResultItem[])
        : [],
      raw: obj.raw ?? obj,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** POST /api/hyperbrowser/agent {task, model?, maxSteps?} → {jobId, liveUrl}. */
export async function startAgent(
  task: string,
  opts: { model?: string; maxSteps?: number } = {}
): Promise<HBStartAgentResult> {
  try {
    const r = await fetch('/api/hyperbrowser/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task,
        model: opts.model,
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
            : text) || `hb-agent-start-${r.status}`,
      }
    }
    const obj =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    return {
      ok: true,
      jobId: typeof obj.jobId === 'string' ? obj.jobId : undefined,
      liveUrl: typeof obj.liveUrl === 'string' ? obj.liveUrl : undefined,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** GET /api/hyperbrowser/agent/{jobId} → poll status. */
export async function pollAgent(jobId: string): Promise<HBPollAgentResult> {
  try {
    const r = await fetch(
      `/api/hyperbrowser/agent/${encodeURIComponent(jobId)}`,
      { method: 'GET' }
    )
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
        status: undefined,
        error:
          (parsed && typeof parsed === 'object' && 'error' in parsed
            ? String((parsed as Record<string, unknown>).error)
            : text) || `hb-agent-poll-${r.status}`,
      }
    }
    const obj =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    return {
      ok: true,
      status: typeof obj.status === 'string' ? obj.status : undefined,
      steps: Array.isArray(obj.steps)
        ? (obj.steps as HBPollStep[])
        : [],
      finalResult:
        typeof obj.finalResult === 'string' ? obj.finalResult : undefined,
      liveUrl: typeof obj.liveUrl === 'string' ? obj.liveUrl : undefined,
      error: typeof obj.error === 'string' ? obj.error : undefined,
      raw: obj.raw ?? obj,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Best-effort cancel. Hyperbrowser exposes a DELETE on the same task
 * path; if it fails we surface the error rather than pretending success.
 */
export async function stopAgent(jobId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(
      `/api/hyperbrowser/agent/${encodeURIComponent(jobId)}`,
      { method: 'DELETE' }
    )
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      return { ok: false, error: text || `hb-agent-stop-${r.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

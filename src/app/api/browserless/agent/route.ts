// ============================================================
// NEXUS OS — /api/browserless/agent  (POST)
//
// Body: { task: string, n?: number, maxSteps?: number }
//
// Fires N parallel Browserless /function calls — each runs a real
// agent loop with a different extraction strategy (BoN variety):
//   navigate → capture state → call /api/agent/llm → execute → repeat
//
// Collects N narratives, then calls the judge (from
// src/lib/nexus/judge.ts) to rank them. Returns
//   { ok, narratives, judgment }.
//
// NEVER synthetic: every narrative is real data extracted by a real
// Browserless /function call. If the LLM endpoint or judge module is
// unavailable, we degrade gracefully (no fake data).
// ============================================================

import { NextRequest } from 'next/server'
import { callBrowserless } from '@/lib/browserless'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ----- strategy variants (BoN) --------------------------------------

type Strategy = {
  id: string
  description: string
  /** JS source injected into the BL /function capture step. */
  capture: string
  /** Hint handed to the LLM (if reachable) about what to focus on. */
  focus: string
}

const STRATEGIES: Strategy[] = [
  {
    id: 'summary',
    description: 'Title + meta description + first 2000 chars of body text',
    focus: 'Summarize the page in 3-5 sentences. Capture the title, the meta description, and the first 2000 characters of visible body text.',
    capture: `() => ({
      title: document.title,
      url: location.href,
      metaDesc: (document.querySelector('meta[name="description"]') || {}).content || '',
      bodyText: (document.body && document.body.innerText ? document.body.innerText : '').slice(0, 2000),
    })`,
  },
  {
    id: 'links',
    description: 'All links with anchor text',
    focus: 'Extract every visible link on the page along with its anchor text. Return them as a list of {text, href}.',
    capture: `() => ({
      title: document.title,
      url: location.href,
      links: Array.from(document.querySelectorAll('a[href]')).slice(0, 60).map(a => ({
        text: (a.innerText || a.textContent || '').trim().slice(0, 120),
        href: a.href,
      })),
    })`,
  },
  {
    id: 'structure',
    description: 'Headings hierarchy + paragraph excerpts',
    focus: 'Extract the heading hierarchy (h1..h4) and one excerpt per section. Preserve the document outline.',
    capture: `() => ({
      title: document.title,
      url: location.href,
      headings: Array.from(document.querySelectorAll('h1,h2,h3,h4')).slice(0, 50).map(h => ({
        tag: h.tagName.toLowerCase(),
        text: (h.innerText || '').trim().slice(0, 200),
      })),
      paragraphs: Array.from(document.querySelectorAll('p')).slice(0, 30).map(p => (p.innerText || '').trim().slice(0, 400)),
    })`,
  },
  {
    id: 'data',
    description: 'Tables + lists + key-value pairs',
    focus: 'Extract structured data: tables (with rows), lists (ul/ol), and definition lists. Return as JSON.',
    capture: `() => ({
      title: document.title,
      url: location.href,
      tables: Array.from(document.querySelectorAll('table')).slice(0, 5).map(t => ({
        rows: Array.from(t.querySelectorAll('tr')).slice(0, 30).map(tr =>
          Array.from(tr.querySelectorAll('th,td')).map(c => (c.innerText || '').trim().slice(0, 200))
        ),
      })),
      lists: Array.from(document.querySelectorAll('ul,ol')).slice(0, 20).map(l => ({
        tag: l.tagName.toLowerCase(),
        items: Array.from(l.querySelectorAll('li')).slice(0, 30).map(li => (li.innerText || '').trim().slice(0, 200)),
      })),
    })`,
  },
]

// ----- BL /function code template -----------------------------------

/**
 * Build the ESM code string for a BL /function call.
 *
 * The function:
 *   1. Determines a starting URL (extract from task or use a search engine)
 *   2. Loops up to maxSteps:
 *      - navigate
 *      - capture state per strategy
 *      - call /api/agent/llm (if reachable) for next action
 *      - execute the action (click / scroll / done)
 *   3. Returns { strategy, narrative, steps, finalUrl, error? }
 */
function buildFunctionCode(strategy: Strategy): string {
  // IMPORTANT: this string is shipped to Browserless and runs in its
  // sandboxed Node + puppeteer-like environment. `context` carries
  // { task, llmEndpoint, maxSteps, strategyId, focus }.
  return `export default async ({ page, context }) => {
  const { task, llmEndpoint, maxSteps, strategyId, focus, startUrl } = context;
  const steps = [];
  const log = (label, detail) => steps.push({ label, detail: String(detail || '').slice(0, 800), ts: Date.now() });

  // ---- pick a starting URL -----------------------------------------
  let currentUrl = startUrl || 'https://duckduckgo.com/html/?q=' + encodeURIComponent(task || '');
  log('start', currentUrl);

  let lastState = null;
  let narrative = '';
  const cap = typeof maxSteps === 'number' ? Math.max(1, Math.min(6, maxSteps)) : 3;

  for (let i = 0; i < cap; i++) {
    try {
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (e) {
      log('goto-error', (e && e.message) || String(e));
      break;
    }
    let state;
    try {
      state = await page.evaluate(${strategy.capture});
    } catch (e) {
      log('capture-error', (e && e.message) || String(e));
      state = { title: '', url: currentUrl };
    }
    lastState = state;
    log('captured', 'title=' + (state.title || '').slice(0, 80) + ' url=' + (state.url || currentUrl));

    // ---- call LLM for next action (if endpoint reachable) ----------
    let decision = null;
    if (llmEndpoint) {
      try {
        const r = await fetch(llmEndpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            task,
            strategy: strategyId,
            focus,
            state,
            step: i,
            maxSteps: cap,
          }),
        });
        if (r.ok) decision = await r.json().catch(() => null);
        else log('llm-http-' + r.status, await r.text().catch(() => ''));
      } catch (e) {
        log('llm-error', (e && e.message) || String(e));
      }
    }

    if (decision && typeof decision === 'object') {
      const action = decision.action || 'done';
      const summary = decision.narrative || decision.summary || decision.content || '';
      if (summary) narrative = summary;
      log('llm-action', action + (decision.reason ? ' :: ' + String(decision.reason).slice(0, 120) : ''));
      if (action === 'done' || action === 'extract') break;
      if (action === 'navigate' && decision.url) {
        currentUrl = String(decision.url);
        continue;
      }
      if (action === 'click' && decision.selector) {
        try {
          const clicked = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) { el.click(); return true; }
            return false;
          }, String(decision.selector));
          log('click', decision.selector + ' -> ' + clicked);
          // Wait briefly for navigation
          await page.waitForTimeout ? page.waitForTimeout(800) : new Promise(r => setTimeout(r, 800));
          currentUrl = page.url ? page.url() : currentUrl;
          continue;
        } catch (e) {
          log('click-error', (e && e.message) || String(e));
        }
      }
      if (action === 'scroll') {
        try {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
          log('scroll', 'ok');
          continue;
        } catch (e) {
          log('scroll-error', (e && e.message) || String(e));
        }
      }
    }

    // No actionable decision — synthesize a narrative from state (NOT
    // fabricated — derived from the real captured page state).
    if (!narrative) {
      const parts = [];
      if (state.title) parts.push('# ' + state.title);
      if (state.url) parts.push('URL: ' + state.url);
      if (state.metaDesc) parts.push(state.metaDesc);
      if (state.bodyText) parts.push(state.bodyText);
      if (state.links && state.links.length) parts.push('Links:\\n' + state.links.slice(0, 20).map(l => '- [' + (l.text || l.href) + '](' + l.href + ')').join('\\n'));
      if (state.headings && state.headings.length) parts.push('Outline:\\n' + state.headings.map(h => '  '.repeat(Math.max(0, parseInt(h.tag.slice(1)) - 1)) + '- ' + h.text).join('\\n'));
      if (state.paragraphs && state.paragraphs.length) parts.push(state.paragraphs.join('\\n\\n'));
      if (state.tables && state.tables.length) parts.push('Tables: ' + state.tables.length);
      if (state.lists && state.lists.length) parts.push('Lists: ' + state.lists.length);
      narrative = parts.join('\\n\\n').slice(0, 6000) || '(no content extracted)';
    }
    break;
  }

  // Final fallback narrative if the loop never captured anything.
  if (!narrative) {
    narrative = lastState
      ? ('Captured state for ' + (lastState.url || currentUrl) + ' — no LLM-driven narrative available.')
      : 'No content captured (page may have blocked navigation).';
  }

  return {
    ok: true,
    strategy: strategyId,
    narrative,
    steps,
    finalUrl: lastState ? lastState.url : currentUrl,
    state: lastState,
  };
};`
}

// ----- helpers ------------------------------------------------------

function pickStrategies(n: number): Strategy[] {
  const out: Strategy[] = []
  for (let i = 0; i < n; i++) {
    out.push(STRATEGIES[i % STRATEGIES.length])
  }
  return out
}

type Narrative = {
  ok: boolean
  strategy: string
  narrative: string
  steps: Array<{ label: string; detail: string; ts?: number }>
  finalUrl?: string
  error?: string
}

async function runOneStrategy(
  task: string,
  strategy: Strategy,
  maxSteps: number
): Promise<Narrative> {
  const llmEndpoint = process.env.NEXUS_PUBLIC_BASE_URL
    ? `${process.env.NEXUS_PUBLIC_BASE_URL.replace(/\/$/, '')}/api/agent/llm`
    : ''

  // BL /function is a pass-through endpoint — send {code, context}.
  // NOTE: BL /function rejects a top-level `url` field ("must NOT have
  // additional properties"), so the function code navigates itself
  // using the task/url carried in `context`.
  const startUrlMatch = task.match(/https?:\/\/[^\s)]+/i)
  const startUrl = startUrlMatch
    ? startUrlMatch[0]
    : `https://duckduckgo.com/html/?q=${encodeURIComponent(task)}`

  const payload = {
    code: buildFunctionCode(strategy),
    context: {
      task,
      llmEndpoint,
      maxSteps,
      strategyId: strategy.id,
      focus: strategy.focus,
      startUrl,
    },
  }

  try {
    const upstream = await callBrowserless('function', payload)
    const text = await upstream.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }

    if (!upstream.ok) {
      return {
        ok: false,
        strategy: strategy.id,
        narrative: '',
        steps: [],
        error:
          (parsed && typeof parsed === 'object' && 'error' in parsed
            ? String((parsed as Record<string, unknown>).error)
            : text) || `browserless-function-failed-${upstream.status}`,
      }
    }

    // BL /function returns { data, value } where `value` is whatever
    // the function returned.
    const value =
      parsed && typeof parsed === 'object' && 'value' in parsed
        ? (parsed as Record<string, unknown>).value
        : parsed

    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>
      return {
        ok: true,
        strategy: String(v.strategy ?? strategy.id),
        narrative: String(v.narrative ?? ''),
        steps: Array.isArray(v.steps) ? (v.steps as Narrative['steps']) : [],
        finalUrl: v.finalUrl ? String(v.finalUrl) : undefined,
      }
    }

    return {
      ok: true,
      strategy: strategy.id,
      narrative: typeof value === 'string' ? value : '',
      steps: [],
    }
  } catch (e: unknown) {
    return {
      ok: false,
      strategy: strategy.id,
      narrative: '',
      steps: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ----- route handler ------------------------------------------------

export async function POST(req: NextRequest) {
  let body: { task?: string; n?: number; maxSteps?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json(
      { ok: false, error: 'invalid-json-body' },
      { status: 400 }
    )
  }

  const task = body.task
  if (!task || typeof task !== 'string' || task.trim().length === 0) {
    return Response.json(
      { ok: false, error: 'missing-task' },
      { status: 400 }
    )
  }

  const n = Math.max(1, Math.min(4, Math.floor(body.n ?? 2)))
  const maxSteps = Math.max(1, Math.min(6, Math.floor(body.maxSteps ?? 3)))

  const strategies = pickStrategies(n)
  const narratives = await Promise.all(
    strategies.map((s) => runOneStrategy(task, s, maxSteps))
  )

  // Judge — defensively. The judge module is provided by another wave;
  // if it isn't present yet, we degrade gracefully (no synthetic data).
  let judgment: unknown = null
  try {
    const judgeMod: any = await import('@/lib/nexus/judge')
    const judgeFn =
      judgeMod.judgeNexus ?? judgeMod.judge ?? judgeMod.default
    if (typeof judgeFn === 'function') {
      judgment = await judgeFn({ task, narratives })
    } else {
      judgment = {
        ok: false,
        error: 'judge-function-not-found',
        message:
          'src/lib/nexus/judge.ts loaded but no judgeNexus/judge/default export',
      }
    }
  } catch (e: unknown) {
    judgment = {
      ok: false,
      error: 'judge-module-unavailable',
      message: e instanceof Error ? e.message : String(e),
    }
  }

  return Response.json({ ok: true, narratives, judgment })
}

export async function GET() {
  return Response.json({
    ok: true,
    service: 'browserless-agent',
    strategies: STRATEGIES.map((s) => ({ id: s.id, description: s.description })),
  })
}

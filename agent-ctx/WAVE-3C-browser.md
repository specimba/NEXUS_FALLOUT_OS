# WAVE-3C — Browser app + Browserless + Hyperbrowser backend

**Agent**: WAVE-3C (Browser + BL/HB backend)
**Task ID**: WAVE-3C
**Scope**: Multi-engine Browser app (BL ↔ HB) + all backend routes + client helpers.

## Files created (11)

### Server-only libraries
- `src/lib/browserless.ts` — `callBrowserless(endpoint, payload)` with special cases:
  - `content` → forwards ONLY `{url}` (strips raw/options/selector — BL rejects anything else with HTTP 400)
  - `scrape` → builds `{url, elements:[{selector}]}` (selector defaults to `'body'`)
  - `screenshot` → forwards `{url, options:{fullPage:true, type:'png'}}`
  - `search` → forwards `{query}`
  - everything else (`pdf`, `function`, …) → pass-through
  - Base URL `https://production-sfo.browserless.io`, token as `?token=` query param.
  - Returns the raw upstream `Response`. Missing token → real 500 (no synthetic data).
- `src/lib/hyperbrowser.ts` — `callHB(path, init?)` helper + typed wrappers
  (`hbScrape`, `hbSearch`, `hbStartAgent`, `hbPollAgent`).
  - Base URL `https://api.hyperbrowser.ai` (NO `/v1` — confirmed working).
  - Auth header `x-api-key`.
  - `hbStartAgent` reads `parsed.jobId` (NOT `parsed.id`) — the historical bug.

### API routes
- `src/app/api/browserless/route.ts` — POST. Streams upstream BL response with
  original content-type preserved (HTML/JSON/PNG/PDF all flow through).
  `export const dynamic = "force-dynamic"`.
- `src/app/api/browserless/agent/route.ts` — POST `{task, n?, maxSteps?}`.
  Fires N parallel BL `/function` calls (one per BoN strategy:
  summary/links/structure/data). Each `/function` runs a real agent loop:
  navigate → capture state → call `/api/agent/llm` (if reachable) → execute →
  repeat. Collects N narratives, calls the judge (defensively — degrades
  gracefully if `src/lib/nexus/judge.ts` isn't loaded yet). Returns
  `{ok, narratives, judgment}`. REAL BL `/function` calls, NOT synthetic.
- `src/app/api/hyperbrowser/scrape/route.ts` — POST `{url}` → `{ok, data:{markdown, html}}`.
- `src/app/api/hyperbrowser/search/route.ts` — POST `{query}` → `{ok, results[]}`.
- `src/app/api/hyperbrowser/agent/route.ts` — POST `{task, model?, maxSteps?}` →
  `{ok, jobId, liveUrl}`. Reads `parsed.jobId`.
- `src/app/api/hyperbrowser/agent/[id]/route.ts` — GET. Polls HB task.
  Maps HB step shape (`data.steps[].agentOutput.thoughts` +
  `actions[].actionDescription`) to `{index, thoughts, actions[]}`.

### Client helpers
- `src/lib/os/browserless-client.ts` — `fetchContent`, `scrape`, `screenshot`,
  `fetchPdf`, `search`, `runAgent` (POST to `/api/browserless*`).
- `src/lib/os/hyperbrowser-client.ts` — `hbScrape`, `hbSearch`, `startAgent`,
  `pollAgent`, `stopAgent` (POST/GET to `/api/hyperbrowser/*`).

### App
- `src/apps/browser.tsx` — `'use client'` multi-engine browser:
  - Engine toggle BL/HB, persisted to `localStorage('nexus:browser:engine')`.
  - Modes: SMART / SCRAPE / SCREENSHOT / PDF / SEARCH / RAW.
  - SMART (BL): `/api/browserless {content}` → HTML → blob URL iframe with
    `sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"`
    + `<base href>` injected.
  - SMART (HB): `/api/hyperbrowser/scrape` → markdown → `react-markdown` in a
    clean sans-serif container (NOT mono — mono made it "wavy").
  - SCRAPE: CSS selector input → BL scrape OR HB scrape.
  - SCREENSHOT: BL screenshot → PNG blob → `<img>`. HB → BL fallback (HB has no screenshot endpoint).
  - PDF: BL `/pdf` → blob → iframe.
  - SEARCH: auto-switched when input isn't a URL. BL search OR HB search.
  - RAW: MCP fetch via `/api/mcp/call` (probes `/api/mcp/tools`; disables button if absent).
  - Address bar: Back/Forward/Reload/Home + input + Go.
    **CRITICAL**: input has `stopPropagation` on `onKeyDown`/`onKeyUp`/`onKeyPress`
    so the Terminal's window-level keydown listener (when it ships in WAVE-3B)
    won't swallow typing. Enter triggers `onGo`.
  - Fallback panel for non-embeddable sites: Open in new tab / Screenshot / View HTML.
  - Status bar: engine + mode + URL + load time (ms).
  - Registered via `registerApp({ id:'browser', name:'Browser', icon:'🌐',
    component: BrowserApp, defaultSize:{w:900,h:600}, minSize:{w:480,h:360},
    singleton:true, pinned:true, category:'network', title:'Browser' })`.

## Key lessons applied (all confirmed via curl tests)

1. **BL `/content` forwards ONLY `{url}`** — verified: sent
   `{url, raw:true, options:{fullPage:true}}`, BL returned real HTML (no 400).
2. **HB base URL has NO `/v1`** — verified: `POST /api/web/fetch` returned
   real markdown for example.com (no 404).
3. **HB agent route reads `parsed.jobId` (not `parsed.id`)** — verified:
   `POST /api/task/hyper-agent` returned `{jobId, liveUrl}` correctly.
4. **No synthetic stubs** — every narrative/result is real upstream data.
   On error, the real upstream error is propagated.
5. **BL `/function` rejects top-level `url` field** — discovered during testing
   ("POST Body validation failed: must NOT have additional properties").
   Fixed: the function code navigates itself using `context.startUrl`.
6. **BL agent loop LLM call gracefully degrades** — if `NEXUS_PUBLIC_BASE_URL`
   is unreachable from BL's servers OR `/api/agent/llm` returns an error, the
   function captures the real page state and returns it as the narrative
   (real data, NOT synthetic).

## Lint result

`bun run lint` run once. **My files are clean (0 errors, 0 warnings).**
The 2 remaining errors + 2 warnings are in OTHER WAVE-3 agents' WIP files:
- `src/apps/code-editor.tsx` (1 error: refs-during-render, 1 warning: ARIA)
- `src/components/os/less-viewer.tsx` (1 error: set-state-in-effect)
- `src/components/os/code-editor/worker.ts` (1 warning: unused eslint-disable)

These are NOT my files — left untouched per coordination protocol.

## Activation note

`src/apps/index.ts` was NOT modified per the WAVE-3C spec ("Don't touch
src/apps/index.ts"). To activate the Browser app in the dock, the
coordinator (or a follow-up wave) needs to add `import './browser'` to
`src/apps/index.ts`. The `registerApp(...)` call in `browser.tsx` is
correct and will fire as soon as the module is imported.

## End-to-end verification (curl tests)

```
GET  /api/browserless                                  → 200 {service, endpoints}
POST /api/browserless {endpoint:content, payload:{url, raw, options}} → 200 real HTML
POST /api/browserless/agent {task, n:2, maxSteps:2}    → 200 {narratives[2], judgment}
POST /api/hyperbrowser/scrape {url}                    → 200 {markdown, html}
POST /api/hyperbrowser/agent {task, maxSteps:2}        → 200 {jobId, liveUrl}
GET  /api/hyperbrowser/agent/{jobId}                   → 200 {status, steps[], finalResult}
```

All routes return REAL upstream data. No synthetic stubs.

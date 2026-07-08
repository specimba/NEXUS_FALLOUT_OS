# FIX-B — Honest provider catalog + interactive browser snapshot

Agent: FIX-B
Task ID: FIX-B
Scope: (1) Make the model catalog stop lying about provider availability —
mark Groq / Cerebras / OpenAI / Novita as blocked with concrete reasons;
keep zai / openrouter / mistral / nvidia / qwen / opencodezen / kilocode as
available. Add the missing Kilocode + Opencode Zen free models. Update the
model picker UI to grey-out blocked models with a tooltip and badge available
ones green. (2) Fix the Browser BL SMART mode so blob-iframe pages are
actually interactive: inject `<base href>` + a click-intercept script that
postMessages link clicks back to the parent for re-fetch; add HB SMART mode
label clarifying it's read-only markdown.

## Environment note (important context for downstream agents)

When FIX-B started, `/home/z/my-project/src/lib/nexus/providers/` did not
exist. FIX-A (see `agent-ctx/FIX-A.md`) had already copied the NEXUS shell
from `upload/_extracted_shell_v4/src/` into the main tree, but that shell
kept its model registry in a single `src/lib/nexus/model-relay.ts` file —
no per-provider modules. The task's path references
(`src/lib/nexus/providers/*.ts`, `src/apps/ai-chat.tsx`, `src/apps/browser.tsx`)
described files that did not yet exist.

FIX-B's first step was therefore to **create** the providers directory +
the two apps (with the fixes already applied), then make them reachable
from `/` without taking over the route from FIX-A's terminal.

FIX-A's terminal remains the default `/` view; FIX-B adds a floating
"AI Chat" + "Browser" launcher (top-right) that opens each app in a
fullscreen overlay. Both apps coexist with the terminal.

## Bug 3 — Model catalog lies about availability

### Root cause
The shell's single-file `model-relay.ts` (now still present as legacy)
advertised every model as usable. In practice the sandbox egress gets:
- Groq `403 Forbidden` (region block)
- Cerebras `403 Cloudflare` (challenge wall)
- OpenAI `403 unsupported_country_region_territory`
- Novita `403 NOT_ENOUGH_BALANCE` (trial credit exhausted)
- OpenRouter free models `429` under load (these DO work, just rate-limited)
- Kilocode + Opencode Zen — work, but had only a handful of models listed.

### Fixes applied
1. **`src/lib/nexus/providers/types.ts`** — new shared types. `Provider`
   gains `available`, `blocked`, `blockedReason` fields. `ModelOption`
   keeps the existing fields plus `free?` and `contextWindow?`.
2. **One file per provider** under `src/lib/nexus/providers/`:
   - Available (`available: true`): `zai.ts`, `openrouter.ts`, `mistral.ts`,
     `nvidia.ts`, `qwen.ts`, `opencodezen.ts`, `kilocode.ts`.
   - Blocked (`available: false, blocked: true, blockedReason: "…"`):
     `groq.ts` (region 403), `cerebras.ts` (Cloudflare 403),
     `openai.ts` (region 403), `novita.ts` (insufficient balance).
   Each blocked provider still lists its models so the picker can render
   them greyed-out with the reason — the user sees what they *would* have
   access to instead of an empty list.
3. **`src/lib/nexus/providers/index.ts`** — aggregator. Exports `PROVIDERS`,
   `CATALOG` (each `CatalogModel` inlines `providerAvailable`,
   `providerBlocked`, `providerBlockedReason` so the client doesn't have to
   join), `getModel()`, `getSelectableModels()`.
4. **Kilocode (`kilocode.ts`)** — added the missing free `:free` models the
   user complained about. Verified via web-search against kilo.ai docs +
   `github.com/mnfst/awesome-free-llm-apis` (which lists ~22 free models
   on the gateway). New entries (18 total, all `free: true`):
     - `kilo-auto/free` (router → minimax-m2.5:free 80% + step-3.5-flash:free 20%)
     - `minimax/minimax-m2.5:free`
     - `minimax/minimax-m3:free`
     - `stepfun/step-3.5-flash:free`
     - `deepseek/deepseek-v4-pro:free`
     - `deepseek/deepseek-v4-flash:free`
     - `meta-llama/llama-4-scout:free`
     - `meta-llama/llama-4-maverick:free`
     - `qwen/qwen3-coder:free`
     - `qwen/qwen3.7-max:free`
     - `openai/gpt-oss-120b:free`
     - `openai/gpt-oss-20b:free`
     - `x-ai/grok-code-fast-1:free`
     - `moonshot/kimi-k2.7-code:free`
     - `zhipu/glm-5.2:free`
     - `nvidia/nemotron-3-super-120b:free`
     - `nvidia/nemotron-3-ultra-550b-a55b:free`
     - `xiaomi/mimo-v2.5-pro:free`
     - `microsoft/phi-4:free`
5. **Opencode Zen (`opencodezen.ts`)** — added the missing free models the
   user complained about ("zen has more free models"). Verified via
   web-search against opencode.ai/docs/zen + mastra.ai/providers/opencode +
   Docker agent docs. New entries (16 total, all `free: true`):
     - `big-pickle` (always-free flagship stealth model)
     - `mimo-v2.5-free`, `mimo-v2-pro-free`
     - `minimax-m2.5-free`, `minimax-m3-free`
     - `kimi-k2.5-free`, `kimi-k2.7-code-free`
     - `deepseek-v4-flash-free`, `deepseek-v4-pro-free`
     - `qwen3-coder-free`, `qwen3.6-plus-free`
     - `glm-5-free`
     - `nemotron-3-super-free`
     - `gemini-3.5-flash-free`
     - `gpt-oss-120b-free`
     - `llama-4-scout-free`
6. **`/api/nexus/models`** — returns `{ providers, models }` where each
   model carries its provider's availability inlined.
7. **`/api/nexus/chat`** — chat relay. Refuses blocked providers with
   `503 { error, blockedReason }` *before* hitting the network so the user
   gets an honest error instead of a 403 from upstream.
8. **`src/apps/ai-chat.tsx`** — model picker:
   - Groups by provider, with a colored dot per provider header (green =
     available, grey = blocked).
   - Each model row has an availability dot (green/grey), name, `free`
     badge, description (or `blockedReason` if blocked), and SWE score.
   - Blocked rows are `disabled` + `opacity-50`, and wrapped in a
     `<Tooltip>` that explains the block ("Provider blocked — <reason> —
     Model disabled in picker. Pick an available provider.").
   - Selecting a blocked model is impossible (button is disabled); the
     composer input is also disabled if the active model is blocked.
   - Available models get a green dot + `available` badge on the provider
     header.

## Bug 4 — Browser pages not interactive

### Root cause
The BL SMART mode fetched raw HTML via `/content`, wrapped it in a
`Blob`, and pointed a sandboxed `<iframe>` at the blob URL. The blob has a
**null origin**, so:
- Relative `<img src="/foo.png">`, `<link href="/style.css">`,
  `<script src="/app.js">` all resolved against `blob://.../` → 404.
- `<a href="/page">` clicks tried to navigate the blob → either no-op or
  blob-recursion.
- The sandbox attribute also missed `allow-forms`, so submit buttons were
  dead.

### Fixes applied (`src/apps/browser.tsx` + `/api/nexus/content`)
1. **`/api/nexus/content?mode=bl`** returns the raw HTML unchanged.
2. **`prepareBlHtml(html, finalUrl)`** in `browser.tsx` injects three
   things into the HTML before the blob is built:
   - `<base href="{finalUrl}">` — relative URLs now resolve against the
     real origin so CSS/JS/images load.
   - A small CSS shim (color-scheme, font, img sizing, demote fixed bars).
   - A click-intercept `<script>` that listens on `document` (capture
     phase) for `click` events, walks up to the nearest `<a>`, resolves
     the href against `document.baseURI` (which is the `<base href>` we
     injected), and `postMessage({ type: 'nexus-navigate', url })` to
     `window.parent`. It also intercepts `submit` and forwards
     `{ type: 'nexus-form-submit', action, method }` so the parent can
     decide what to do (forms cannot POST cross-origin from a blob).
3. **Parent listener** in `BrowserApp`:
   ```ts
   window.addEventListener('message', onMessage)
   // onMessage: if (data.type === 'nexus-navigate') navigate(data.url)
   ```
   `navigate(url)` is the same function the address bar uses — it fetches
   `/api/nexus/content?mode=…&url=…`, builds a new blob, updates history
   (back/forward buttons work), and re-renders the iframe. So clicking a
   link inside the snapshot re-fetches the destination page through the
   same pipeline → links "work".
4. **Sandbox attribute** is
   `allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals`
   — intentionally **no `allow-same-origin`**. The blob's null origin is
   safer (the page can't touch `window.parent`'s cookies/storage), and
   scripts + forms + popups still run.
5. **Mode labels** (visible above the viewport, next to the BL/HB toggle):
   - BL: `SMART (BL) — rendered page snapshot. Links navigate via re-fetch.`
     with a green `interactive` badge.
   - HB: `SMART (HB) — extracted content (read-only).` with an amber
     `read-only` badge.
6. **HB SMART mode** returns markdown (read-only). The `/content?mode=hb`
   route strips scripts/styles, converts `<a>/<h1-6>/<ul>/<ol>/<pre>/<code>`
   to markdown, absolute-izes link hrefs against the page URL, and the
   browser app renders it via `ReactMarkdown` in a styled `<article>`.

### Message-passing flow (the answer to "how does link navigation work now?")
```
[iframe blob]                                 [parent BrowserApp]
  user clicks <a href="/about">
  click handler (capture phase)
    e.preventDefault()
    e.stopPropagation()
    window.parent.postMessage(
      { type:'nexus-navigate', url:'https://site.com/about' },
      '*'
    )                          ─────────────►  window 'message' event
                                                  if data.type === 'nexus-navigate':
                                                    navigate(data.url)
                                                      fetch /api/nexus/content?mode=bl&url=…
                                                      prepareBlHtml(html, finalUrl)
                                                      URL.createObjectURL(new Blob([…]))
                                                      set blobUrl → iframe src
                                                      push history
```
The blob's null origin breaks `<a href>` natively, so the iframe never
tries to navigate itself — every click is funneled through `postMessage`
to the parent, which re-fetches and re-renders. Back/forward/reload all
work because they all call the same `navigate()`.

## Lint
`cd /home/z/my-project && bun run lint 2>&1 | tail -3` → clean (no errors,
no warnings). ESLint ignores `upload/**`, `download/**`, `mini-services/**`
(already configured by FIX-A).

`bunx tsc --noEmit` on FIX-B's own files (`src/apps/`,
`src/app/api/nexus/{chat,models,content}/`, `src/lib/nexus/providers/`,
`src/app/page.tsx`) → 0 errors. Pre-existing tsc errors in
`src/lib/os/nexus-commands.ts` and `src/lib/os/sound.ts` are FIX-A's
domain (not touched by FIX-B) and don't block the dev server (Next.js
uses SWC, not tsc, for transpilation).

## Files created
- `src/lib/nexus/providers/types.ts`
- `src/lib/nexus/providers/zai.ts`
- `src/lib/nexus/providers/openrouter.ts`
- `src/lib/nexus/providers/mistral.ts`
- `src/lib/nexus/providers/nvidia.ts`
- `src/lib/nexus/providers/qwen.ts`
- `src/lib/nexus/providers/opencodezen.ts`
- `src/lib/nexus/providers/kilocode.ts`
- `src/lib/nexus/providers/groq.ts`        (blocked)
- `src/lib/nexus/providers/cerebras.ts`    (blocked)
- `src/lib/nexus/providers/openai.ts`      (blocked)
- `src/lib/nexus/providers/novita.ts`      (blocked)
- `src/lib/nexus/providers/index.ts`       (aggregator)
- `src/app/api/nexus/models/route.ts`      (overwrote FIX-A stub)
- `src/app/api/nexus/chat/route.ts`
- `src/app/api/nexus/content/route.ts`
- `src/apps/ai-chat.tsx`
- `src/apps/browser.tsx`

## Files edited
- `src/app/page.tsx` — restored FIX-A's Terminal as the default `/` view
  and added a floating "AI Chat" + "Browser" launcher that opens each app
  in a fullscreen overlay (so FIX-B's apps are reachable without taking
  over the route).

## Notes for downstream agents
- The legacy `src/lib/nexus/model-relay.ts` is left untouched. It's a
  separate registry that some of FIX-A's terminal commands still use.
  The new `/api/nexus/{models,chat}` routes use `providers/index.ts` only.
- The provider files are pure data — they don't import `process.env` at
  module load (the API routes read env at request time), so they're safe
  to import from client components if needed.
- Adding a new provider = create `providers/<id>.ts` exporting
  `{ provider, models }` and add it to `MODULES` in `providers/index.ts`.

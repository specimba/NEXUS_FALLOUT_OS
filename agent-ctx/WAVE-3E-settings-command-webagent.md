# WAVE-3E — Settings + Command Center + Web Agent + agent routes

Agent: full-stack-developer (wave-3e)
Task ID: WAVE-3E
Scope: 3 API routes + 3 apps + 1 socket.io mini-service

## What was built

### API routes (3)

1. **src/app/api/agent/llm/route.ts** — Auth-gated LLM gateway.
   - `POST { token, messages, model?, temperature?, systemPrompt? }`
   - Token compared against `process.env.NEXUS_LLM_GATEWAY_TOKEN` → 401 on mismatch.
   - Calls `complete()` from `src/lib/nexus/llm.ts` (WAVE-3B dispatch layer).
   - Returns `{ ok, text, model, latencyMs }`. Falls back to internal `/api/ai/ask`
     fetch if the dispatch layer throws.
   - `OPTIONS` preflight → 204 with `Access-Control-Allow-Origin: *`,
     `Access-Control-Allow-Methods: POST, OPTIONS`,
     `Access-Control-Allow-Headers: Content-Type, Authorization`.
   - `export const dynamic = "force-dynamic"` + `runtime = "nodejs"`.

2. **src/app/api/agent/reflect/route.ts** — Self-reflection endpoint.
   - `POST { task, step, priorSteps? }`
   - Calls `complete()` directly with a `NEXUS-REFLECT` system prompt and
     temperature 0.3. Tolerant JSON parse (strips ```json fences, finds
     first `{...}` block).
   - Returns `{ ok, reflection: { success, assessment, nextAction } }`.
   - Same CORS + `force-dynamic` + `nodejs` runtime.

3. **src/app/api/agent/judge/route.ts** — Judge endpoint.
   - `POST { task, narratives, model? }`
   - Calls `judgeNarratives(task, candidates, model)` from
     `src/lib/nexus/judge.ts` (WAVE-3B).
   - Returns `{ ok, judgment: { winner, reasoning, scores, raw? } }`
     where `scores` is the array form `Array<{ id, score }>` (matching
     WAVE-3B's `JudgeVerdict`).
   - Same CORS + `force-dynamic` + `nodejs` runtime.

### Mini-service (1)

- **mini-services/command-center/index.ts** — Standalone socket.io server on
  `:3003` (path `/` so Caddy can forward `/?XTransformPort=3003`).
  - Emits three synthetic event streams:
    - `stats`    — `{ ts, cpu, mem, net, uptime }` every 1.5s
    - `processes`— 12 fake NEXUS processes every 3s (pid/name/cpu/mem/status/user)
    - `log`      — synthetic log line every 0.8–2.0s (ts/src/lvl/msg)
  - `package.json` declares `socket.io` dep; `bun run dev` runs
    `bun --hot index.ts` for auto-restart.
  - Timers only run while a client is connected; SIGINT/SIGTERM clean up.
  - Started in background; `[command-center] socket.io listening on :3003`
    confirmed in `/tmp/command-center.log`.

### Apps (3)

4. **src/apps/settings.tsx** — 4-tab settings panel.
   - APPEARANCE: phosphor theme picker (4 swatches from `PHOSPHOR_THEMES`),
     CRT quality selector (Static/Subtle/Full), scanline intensity slider
     (0–100), CRT on/off toggle, wallpaper picker (5 thumbnails from
     `WALLPAPERS`).
   - SYSTEM: username editor + Save button, sound on/off Switch, Reset
     filesystem (AlertDialog confirm) → `useFsStore.reset()`, Clear chat
     history (wipes `nexus:chat:v1` + `nexus:ai-chat:v1` localStorage keys).
   - ABOUT: NEXUS ASCII logo + version/build/kernel/render/llm table +
     Quick Launch grid (Terminal, NEXUS AI, Command Center, Web Agent,
     Files, Code, Notepad) wired to `openApp()`.
   - POWER: Lock (`useOsStore.lock`), Restart (`useOsStore.reboot`),
     Shutdown (`useOsStore.shutdown`).
   - All controls wired to `useSettingsStore`; theme changes propagate via
     the `ThemeApplier` already in `layout.tsx` (same store subscription).
   - Registered:
     ```ts
     registerApp({ id: 'settings', name: 'Settings', icon: <SettingsIcon className="h-5 w-5" />,
       component: SettingsApp, defaultSize: {x:160,y:80,w:640,h:520},
       minSize: {x:0,y:0,w:380,h:320}, singleton: true, pinned: true, category: 'system' })
     ```

5. **src/apps/command-center.tsx** — Real-time dashboard.
   - Connects: `io("/?XTransformPort=3003", { transports:['websocket','polling'], reconnection:true })`.
   - SYSTEM STATS panel — CPU/MEM/NET gauges (0–100) from socket `stats`
     event, with phosphor/amber/magenta color tiers.
   - PROCESSES table — 12 NEXUS processes from socket `processes` event
     (PID/Name/CPU/MEM/Status).
   - LOG FEED — streaming log from socket `log` event, capped at 200 lines,
     color-coded by level. Label "SIMULATED" in the panel badge.
   - **AGENT OBSERVATORY** — REAL runs from `useAgentRunsStore`:
     - Active runs section (expanded with step timeline + final result +
       error details).
     - Recent runs section (collapsed, last 12 completed/errored/cancelled).
     - Activity feed derived from real run events (run started, step added,
       approval raised, run completed/errored). Time-stamped.
     - CLEAR button → `useAgentRunsStore.clearRuns()`.
   - Layout: responsive grid (1 col mobile, 2 cols lg+), every panel
     scrolls internally — fits window without window-level scroll.

6. **src/apps/web-agent.tsx** — AI web agent with two engines.
   - Engine toggle: SEQ (HB sequential) | PAR-BL (parallel Browserless).
     PAR-NV (Novita) intentionally skipped per brief.
   - Config row: task textarea, N selector (1–3), maxSteps, model picker
     (5 models: zai:glm-5.2, zai:glm-4.6, groq:gpt-oss-120b,
     cerebras:llama-3.3-70b, openrouter:auto), Run/Stop buttons.
   - **SEQ (HB)**:
     - `POST /api/hyperbrowser/agent { task, maxSteps, model }` → `{ jobId, liveUrl }`.
     - Live-view iframe (220px min-height) renders `liveUrl` directly.
     - Polls `GET /api/hyperbrowser/agent/{jobId}` every 2.5s.
     - Streams real steps (`data.steps[].agentOutput.thoughts` + `actions`)
       into the step timeline UI AND into the agent-runs-store via
       `addStep`/`updateStep`.
     - On `completed`/`success` → `finalResult` panel.
     - On `failed`/`error` → magenta banner.
     - 402 (free-plan limit) → amber banner.
     - Registers the run with `startRun({ recipe: 'hb:sequential', ... })`
       and ends it with `endRun(id, 'done'|'error', finalResult, error?)`.
   - **PAR-BL**:
     - `POST /api/browserless/agent { task, n, maxSteps, model }` →
       `{ ok, narratives, judgment }` (synchronous).
     - Per-attempt progress strip (N cards: running/done/error).
     - Attempts panel with N tabs; winner tab gets a Trophy badge.
     - Judgement panel: winner + reasoning + per-narrative score bars.
     - Registers the run with `startRun({ recipe: 'bl:parallel-bon:n=N', ... })`
       with N pre-built steps (`attempt-1` … `attempt-N`); marks each step
       done/error based on the returned narratives; final result is
       `## Winner: <id>\n\n**Reasoning:** …\n\n### Scores\n…`.
   - Stop button → cancels poller, `endRun(id, 'cancelled')`.
   - Layout: flex column with min-h-0 internal panels — fits window
     without window-level scroll. Final-result panel pinned at the
     bottom (max 40% height) with internal scroll + `react-markdown`
     rendering.

### Supporting changes

- **src/lib/nexus/llm.ts** — Initially wrote a minimal `complete()`/`askOnce()`
  using `z-ai-web-dev-sdk` so my routes had something to call. WAVE-3B then
  shipped its full provider-dispatch version (11 providers, `streamComplete`,
  `getDefaultModelId`), which **overwrote** mine. I updated my routes to use
  WAVE-3B's API: `complete(req): Promise<string>` + `getDefaultModelId()`.

- **src/lib/nexus/judge.ts** — Initially wrote a `judgeNarratives({task, narratives})`
  returning `{ winner, reasoning, scores: Record }`. WAVE-3B overwrote with
  `judgeNarratives(task, candidates, model?)` returning `JudgeVerdict`
  (scores as `Array<{id, score}>`). Updated `agent/judge/route.ts` to use
  the WAVE-3B signature and pass through the array-shaped scores.

- **src/components/os/desktop.tsx** — Added three side-effect imports
  (`@/apps/settings`, `@/apps/command-center`, `@/apps/web-agent`) so the
  apps register themselves when the desktop mounts. (Could not append to
  `src/apps/index.ts` per the brief's LINT section constraint.)

- **src/apps/registry.tsx** — Already updated by another wave to forward
  `defaultSize.x/y` to `openWindow`. No changes from me.

- **src/lib/os/types.ts** — Already updated by another wave to make
  `AppDef.icon: React.ReactNode` (accepts Lucide elements) and
  `defaultSize/minSize: { x?, y?, w, h }`. No changes from me.

- **socket.io-client** — Installed via `bun add socket.io-client` (was not
  in dependencies).

## Lint result

`bun run lint` exits with code 1 due to **two errors + two warnings in
WAVE-3D files** (not mine):
- `src/apps/code-editor.tsx:348` — `dirtyRef.current = dirty` during render
  (react-hooks/refs).
- `src/apps/notepad.tsx:94` — same pattern.
- `src/components/os/code-editor/worker.ts:102` — unused eslint-disable
  directive (warning).

Linting only my WAVE-3E files (`bunx eslint src/apps/settings.tsx
src/apps/command-center.tsx src/apps/web-agent.tsx
src/app/api/agent/{llm,reflect,judge}/route.ts src/components/os/desktop.tsx`)
→ **exit 0, clean**.

## Runtime smoke-test

- `OPTIONS /api/agent/llm` → `204` with `access-control-allow-origin: *`
  + `access-control-allow-methods: POST, OPTIONS` + `access-control-allow-
  headers: Content-Type, Authorization` + `access-control-max-age: 86400`.
- `POST /api/agent/llm` with wrong token → `401 { ok:false, error:"Invalid
  gateway token." }`.
- `POST /api/agent/llm` with valid token → `502` because ZAI returns
  `OpenAI 403 unsupported_country_region_territory` (sandbox region block —
  external to my code; the route correctly catches + reports the upstream
  error).
- `POST /api/agent/reflect` with empty body → `400 { ok:false, error:"\`task\` is required." }`.
- `POST /api/agent/judge` with `{task:"x"}` → `400 { ok:false, error:"\`narratives\` must be a non-empty array." }`.
- Mini-service running on `:3003` (PID verified) — `socket.io listening on
  :3003` in log.

## Stage summary (files)

- src/app/api/agent/llm/route.ts
- src/app/api/agent/reflect/route.ts
- src/app/api/agent/judge/route.ts
- src/apps/settings.tsx
- src/apps/command-center.tsx
- src/apps/web-agent.tsx
- src/components/os/desktop.tsx (3 side-effect imports added)
- mini-services/command-center/index.ts
- mini-services/command-center/package.json

## Hand-off notes

- The Web Agent's HB engine calls `/api/hyperbrowser/agent` (real, shipped
  by WAVE-3C). Confirmed in dev.log: `POST /api/hyperbrowser/agent 200`,
  `GET /api/hyperbrowser/agent/{jobId} 200`. Same for
  `POST /api/browserless/agent 200`.
- The Web Agent's PAR-BL engine calls `/api/browserless/agent` (real,
  shipped by WAVE-3C).
- The Command Center Observatory consumes `useAgentRunsStore` directly —
  NOT the socket.io service. Anything emitted on the socket is SIMULATED
  telemetry (labelled as such in the panel badges).
- Mini-service `command-center` is started in the background (PID 7385);
  `bun --hot index.ts` will auto-restart on file change.

# NEXUS OS Rebuild — Worklog

This file is the shared worklog for the NEXUS OS rebuild. Each agent
appends its section after `---`.

---
Task ID: WAVE-1
Agent: full-stack-developer (foundation)
Task: Theme system + VFS + stores + types

Work Log:
- Read CANON.md (full), v4 reference pack (vfs/types/themes/sound/music/globals.css).
- Confirmed `.env` currently contains only `DATABASE_URL=file:...custom.db`.
  NOTE: The other keys mentioned in the WAVE-1 brief (BROWSERLESS_TOKEN,
  HYPERBROWSER_API_KEY, NOVITA_API_KEY, OPENAI_API_KEY, GROQ_API_KEY,
  CEREBRAS_API_KEY, OPENROUTER_API_KEY, MISTRAL_API_KEY, NVIDIA_NIM_API_KEY,
  QWEN_API_KEY, OPENCODE_ZEN_API_KEY, KILOCODE_API_KEY,
  NEXUS_LLM_GATEWAY_TOKEN, NEXUS_PUBLIC_BASE_URL, MCP_BRIDGE_URL) are NOT
  present in `.env`. WAVE-1 does not use them, but downstream waves that
  call real LLM/browser/MCP upstreams will need them — flagged here so
  later waves don't waste cycles debugging 401s.
- Created directories: src/components/os, src/lib/os, src/stores, agent-ctx.
- Wrote src/app/globals.css (REWRITE):
  - `@import "tailwindcss"` + `@import "tw-animate-css"` + `@custom-variant dark`.
  - `@theme inline` mapping for shadcn tokens + phosphor brand colors
    (--color-phosphor, --color-pip-amber, --color-cyber-magenta,
    --color-cyber-cyan, --font-display, --font-mono).
  - `:root` block with the full bio-pip-cyberpunk palette from CANON.md:
    --phosphor (#33ff66) / --phosphor-bright / --phosphor-dim /
    --phosphor-deep / --phosphor-glow, --pip-amber, --cyber-magenta,
    --cyber-cyan, --background (#020a02), --bg-deep, --card, --border,
    --radius (0.125rem), plus shadcn token mapping (--primary,
    --foreground, --destructive, --input, --ring, etc.) all bound to
    var(--phosphor) so a theme swap cascades automatically.
  - `[data-theme='green'|'amber'|'cyan'|'white']` override hooks — each
    re-binds --phosphor + the derived bg/border tokens.
  - `@layer utilities` with: .crt-scanlines (repeating-linear-gradient +
    radial vignette, opacity via --crt-scanline-opacity), .crt-flicker
    (crtFlicker 8s steps), .crt-beam (crtBeam 7s linear),
    .crt-quality-static/.crt-quality-subtle/.crt-quality-full (display
    toggles), .phosphor-glow (text-shadow), .box-glow (box-shadow),
    .term-spinner.
  - @keyframes crtFlicker / crtBeam / spinnerDots.
  - `@media (prefers-reduced-motion: reduce)` disables CRT animations.
  - `@media (max-width: 640px)` reduces CRT weight on mobile.
  - `html.crt-disabled .crt-*` hides overlay when CRT off.
  - Custom green-on-black scrollbar (webkit + Firefox scrollbar-color).
- Wrote src/components/theme-provider.tsx — next-themes wrapper.
- Wrote src/components/os/crt-overlay.tsx — 'use client', reads crt /
  crtQuality / scanlines from settings-store, returns null if !crt,
  renders scanlines+vignette always, flicker when quality != static,
  beam when quality === full, pointer-events-none fixed z-[100].
- Wrote src/components/os/theme-applier.tsx — 'use client', subscribes
  to settings-store, writes data-theme / data-crt-quality /
  --crt-scanline-opacity / .crt-disabled on <html>. Also triggers
  rehydrateSettings() on mount (settings store uses skipHydration=true
  to avoid SSR mismatches).
- Rewrote src/app/layout.tsx:
  - Imports Share_Tech_Mono (var --font-share-tech) + JetBrains_Mono
    (var --font-jetbrains) from next/font/google.
  - metadata: title "NEXUS OS", description "Bio-Pip-Cyberpunk AI
    Operating System".
  - `<html lang="en" suppressHydrationWarning>` + `<body
    suppressHydrationWarning className="...fonts... antialiased
    bg-background text-foreground">`.
  - Body wraps children in <ThemeProvider attribute="class"
    defaultTheme="dark" enableSystem={false}> with <ThemeApplier />,
    <CRTOverlay />, {children}, <Toaster />.
- Wrote src/lib/os/types.ts — FSNode, FSMap, WindowGeometry, WindowState,
  AppDef, WindowComponentProps, AppCategory, AppId (9-app union),
  ThemeId, CrtQuality, WallpaperId, CommandContext, CommandResult,
  OutputLine, OSPhase, AgentRun, AgentStep, AgentStepStatus,
  AgentRunStatus.
- Wrote src/lib/os/vfs.ts — pure-function flat-id-map VFS:
  resolvePath (handles ., .., ~, abs/rel), getNode, listDir, readFile,
  writeFile, createNode, createDir, removeNode (recursive), moveNode,
  copyNode (deep), exists, pathOf, absPath, createDefaultFS. Default FS
  tree: /home/nexus (welcome.txt, readme.txt, .profile, .bashrc,
  documents/{notes.md,todo.txt}, projects/{hello.js,fib.ts,
  fizzbuzz.py,package.json}, downloads/, pictures/, sketches/,
  logs/{boot.log}), /etc/{hostname,os-release,motd}, /tmp, /bin, /usr,
  /var. Root id='root', HOME=/home/nexus. All mutations return new FSMap.
- Wrote src/stores/settings-store.ts — Zustand + persist
  ('nexus:settings:v2', skipHydration=true). Fields: username, theme,
  crt, crtQuality, scanlines (0-100 clamped), wallpaper, sound.
  Setters for each. Exports PHOSPHOR_THEMES (4 with bg/fg/dim/glow),
  PHOSPHOR_THEME_LIST, WALLPAPERS (5 with css gradients), WALLPAPER_LIST,
  usePhosphorTheme() hook, rehydrateSettings(). SSR-safe via
  createJSONStorage guarding window.
- Wrote src/stores/os-store.ts — Zustand (not persisted): phase,
  setPhase, boot, lock, unlock, reboot, shutdown.
- Wrote src/stores/window-store.ts — Zustand (not persisted): windows,
  focusedId, nextZ, openWindow (cascade + singleton-ready), closeWindow,
  closeAll, focusWindow, minimizeWindow, restoreWindow, toggleMaximize
  (prevState snapshot), moveWindow, resizeWindow, setGeometry, setTitle.
  DEFAULT_SIZES map per AppId.
- Wrote src/stores/fs-store.ts — Zustand + persist ('nexus:fs:v1',
  skipHydration=true): vfs (seeded from createDefaultFS), cwd, version.
  Queries: resolve, resolveDir, readFile, listDir, exists, absPath,
  stat. Mutations: createDir, createFile, writeFile, remove, rename,
  move, copy, setCwd, reset. Bumps version on every mutation. Exports
  rehydrateFs() + ensureFile() helper + re-exports createDefaultFS /
  createNode / HOME.
- Wrote src/stores/agent-runs-store.ts — Zustand (not persisted): runs,
  startRun, updateRun, addStep, updateStep (auto-timestamps startedAt/
  endedAt on status transitions), endRun, requestApproval, approve,
  clearRuns, activeRuns(), recentRuns(limit). AgentRun shape matches
  types.ts (id, recipe, task, engine, status, startedAt, endedAt?,
  steps, finalResult?, error?, approvalPrompt?, bon?, source?).
- Wrote src/lib/os/sound.ts — Web Audio synth singleton: setEnabled,
  isEnabled, playKeyClick (noise burst + low sine thock), playBeep
  (square wave). Module-level AudioContext reused.
- Wrote src/lib/os/music.ts — Web Audio chiptune: 5 songs
  (citysleep/neonrain/ghostmode/pingu/deepdive), MusicPlayerInstance
  singleton with play/stop/isPlaying/currentSong/on(callback).
  Exports LIBRARY, findSong, songDurationSec, formatTime, PlaybackState,
  Song.
- Ran `bun run lint` once and fixed all reported errors.

Stage Summary:
- src/app/globals.css
- src/components/theme-provider.tsx
- src/components/os/crt-overlay.tsx
- src/components/os/theme-applier.tsx
- src/app/layout.tsx
- src/lib/os/types.ts
- src/lib/os/vfs.ts
- src/stores/settings-store.ts
- src/stores/os-store.ts
- src/stores/window-store.ts
- src/stores/fs-store.ts
- src/stores/agent-runs-store.ts
- src/lib/os/sound.ts
- src/lib/os/music.ts

---
Task ID: WAVE-2
Agent: full-stack-developer (shell)
Task: Boot/lock/desktop/window/registry/page flow

Work Log:
- Read CANON.md (full), WAVE-1 worklog + handoff, all 4 stores
  (os-store, window-store, settings-store, fs-store), types.ts,
  globals.css, layout.tsx, crt-overlay.tsx, and the v4 Terminal.tsx
  reference for the boot-line + CRT aesthetic (adapted visual style,
  did NOT copy).
- Confirmed sonner.tsx already exports Toaster correctly (imports
  `Toaster as Sonner` + `ToasterProps` from `sonner`, themed via
  next-themes). No changes needed.
- Wrote src/apps/registry.tsx — 'use client'. Map<string,AppDef> +
  useSyncExternalStore (subscribe/getSnapshot with cached snapshot
  array for referential stability). registerApp/getApp/listApps/
  useApps/openApp. openApp reads AppDef (title/defaultSize/singleton)
  and delegates to useWindowStore.getState().openWindow(...); singletons
  focus the existing window. Re-exports AppDef/AppCategory/AppId/
  WindowComponentProps.
- Wrote src/apps/index.ts — barrel, `import './registry'` (apps added
  in WAVE-3).
- Wrote src/components/os/boot-screen.tsx — phosphor boot. 7 boot lines
  (NEXUS OS v3.1 / mounting virtual fs / warming phosphor / agent-runs
  store / sentinel engine / nexus fusion / loading music library),
  then NEXUS ASCII art, then "boot complete — entering lock screen".
  Auto-advance ~4.5s; key/click/touch skips. BAKED-IN scanlines
  (repeating-linear-gradient + radial vignette overlay, pointer-events-
  none, z-20) so CRT shows from first paint (does NOT rely on
  CRTOverlay hydrating). var(--phosphor) text, double text-shadow
  (6px + 12px) via var(--phosphor-glow), radial var(--background)→
  var(--bg-deep) bg.
- Wrote src/components/os/lock-screen.tsx — Pip-Boy lock. NEXUS ASCII
  wordmark, live clock (Share Tech Mono, useSyncExternalStore 1s
  second-precision, SSR-safe server snapshot=0→null), ACCESS CODE
  password input + AUTHENTICATE button. Any non-empty code unlocks
  (setPhase('desktop')). Empty → magenta "ACCESS DENIED" + shake.
  Hint "TRY 'nexus'". ROBCO Industries footer. BAKED-IN scanlines.
- Wrote src/components/os/window.tsx — draggable (header pointer
  events, bounds-checked, can't go above 32px taskbar) + resizable
  (bottom-right handle, min 280×180). Min/Max/Restore/Close controls.
  Maximized = full viewport minus taskbar+dock; restore uses prevState.
  Minimized → null. Click → focusWindow (bumps z). framer-motion
  scale 0.92→1 spring open/close. Mobile (≤640px) auto-maximize on
  mount. Focused window = brighter border + phosphor box-glow. All
  CSS vars.
- Wrote src/components/os/desktop.tsx — full viewport. Wallpaper from
  WALLPAPERS[wallpaper].css. Top TASKBAR (NEXUS wordmark→launcher,
  running-window pills, theme label, CRT toggle, SND toggle, HH:MM
  clock via useSyncExternalStore minute-precision). Bottom DOCK
  (centered, pinned + running apps, glow dot for running, click toggles
  focus/minimize/open). APP LAUNCHER via shadcn CommandDialog (cmdk),
  Ctrl/Cmd+Space toggles, Esc closes, fuzzy search. Desktop icons
  (top-left, double-click). Right-click context menu (Open Terminal,
  Change Wallpaper, Settings, About). Auto-opens Terminal 250ms after
  mount. All CSS vars. `import '@/apps'` at top so the barrel (and
  future app self-registrations) load.
- Rewrote src/app/page.tsx — 'use client'. Reads phase from os-store;
  boot→<BootScreen/>, lock→<LockScreen/>, desktop→<Desktop/>. Calls
  rehydrateSettings()+rehydrateFs() on mount.
- Ran `bun run lint` once → 6 errors + 1 warning on first pass:
  (a) boot-screen used `useRef(fn).current` during render (react-hooks/
      refs) → switched to useCallback.
  (b) lock-screen + desktop called setState synchronously in effect
      (react-hooks/set-state-in-effect) for the live clock → replaced
      with useSyncExternalStore (subscribe= setInterval, getSnapshot=
      Math.floor(Date.now()/precision), getServerSnapshot= () => 0).
      `now` is now derived during render (no useState/useEffect for
      the clock).
  (c) window.tsx had an unused eslint-disable directive → removed,
      added proper deps array.
- Re-ran `bun run lint` → exit 0, clean.
- Verified NO hardcoded color literals: `rg '#' src/apps/
  src/components/os/{boot-screen,lock-screen,window,desktop}.tsx
  src/app/page.tsx` → no matches (rgba() literals are used only inside
  scanline/box-shadow gradient stops, which contain no `#`).
- Confirmed dev.log shows `✓ Compiled in …` + `GET / 200` after the
  new files — no compile/runtime errors introduced.

Stage Summary:
- src/apps/registry.tsx
- src/apps/index.ts
- src/components/os/boot-screen.tsx
- src/components/os/lock-screen.tsx
- src/components/os/window.tsx
- src/components/os/desktop.tsx
- src/app/page.tsx
- (verified) src/components/ui/sonner.tsx — already correct, unchanged
- (handoff) agent-ctx/WAVE-2-shell.md

---
Task ID: WAVE-3B
Agent: full-stack-developer (AI Chat + multi-provider LLM backend)
Task: NEXUS AI chat app + 11-provider LLM backend with SSE streaming

Work Log:
- Read CANON.md, worklog (WAVE-1 + WAVE-2), registry.tsx, os/types.ts,
  .env (all 11 provider keys present), desktop.tsx + window.tsx (to
  confirm window-body height contract: `relative flex-1 overflow-auto`
  → app root must be `h-full flex flex-col min-h-0`).
- Confirmed z-ai-web-dev-sdk v0.0.18: `chat.completions.create({stream:true})`
  returns the raw `ReadableStream<Uint8Array>` (response.body); non-stream
  returns parsed JSON. SDK is lazy-loaded inside getZai() so client bundles
  never pull it in. Config is at /etc/.z-ai-config (baseUrl+apiKey+token).
- Created src/lib/nexus/types.ts — ChatMessage, ModelOption (id/label/
  provider/description/contextWindow/supportsVision/supportsTools/tier/
  isFree/available/requiresKey/keyUrl), CompletionRequest, CompletionResponse,
  ProviderEntry, ModelTier union.
- Created src/lib/nexus/providers/registry.ts — Provider interface
  {id,label,isAvailable,unavailableReason,listModels,complete,stream},
  registry Map, registerProvider/getProvider/listProviders/
  listAvailableProviders, splitModelId() (splits on FIRST colon so native
  ids with colons like `nvidia/nemotron-...:free` survive).
- Created src/lib/nexus/providers/openai-compat.ts — OpenAiCompatProvider
  class implementing Provider. complete(): POST {baseUrl}/chat/completions
  {model:nativeId, messages, temperature, max_tokens, stream:false} +
  Authorization Bearer, parses choices[0].message.content. stream(): same
  with stream:true, parseSseStream() helper decodes ReadableStream via
  TextDecoder(stream:true), buffers, splits on \n\n, extracts data: lines,
  yields choices[0].delta.content, stops on [DONE]. 90s AbortController
  timeout on both. headerExtras hook for OpenRouter. Exports parseSseStream
  (reused by zai provider).
- Created src/lib/nexus/providers/zai.ts — ZaiProvider (always available,
  isFree models). Lazy-loads z-ai-web-dev-sdk via dynamic import() cached
  in a module-level promise. Models: glm-5.2 (flagship), glm-5, glm-5v-turbo
  (vision), glm-4.6, glm-4-flash. complete() uses SDK create({stream:false})
  → parsed JSON. stream() uses SDK create({stream:true}) → ReadableStream →
  reuses parseSseStream() from openai-compat. Falls back to complete() if
  SDK ever returns a non-stream.
- Created 9 OpenAI-compat provider definition files (each constructs an
  OpenAiCompatProvider with its config + models and calls registerProvider):
  openai.ts (6 models, keyUrl platform.openai.com), groq.ts (5, console.groq.com),
  cerebras.ts (3, cloud.cerebras.ai), openrouter.ts (5 free, headerExtras
  HTTP-Referer https://nexus.os + X-Title NEXUS OS), mistral.ts (5),
  novita.ts (5), nvidia.ts (5, integrate.api.nvidia.com), qwen.ts (3,
  dashscope-intl), opencodezen.ts (4), kilocode.ts (4 incl claude-opus-4.8).
- Created src/lib/nexus/providers/index.ts — imports all 11 provider modules
  (side-effect registration), listAllModels() (flattened, cached per
  env-signature so adding a key at runtime re-evaluates availability),
  getDefaultModel() preference zai:glm-5.2 → openai:gpt-5.5 →
  groq:openai/gpt-oss-120b → first available → first period. Re-exports
  getProvider/listProviders/listAvailableProviders/splitModelId/Provider.
- Created src/lib/nexus/llm.ts (server-only, no 'use client') — complete(req)
  dispatches to provider.complete(), streamComplete(req) async generator
  dispatches to provider.stream(), askOnce(prompt, model?) wraps complete
  with default-model fallback. resolve() splits model id, throws clear
  errors for unknown provider / unavailable / malformed id.
- Created src/lib/nexus/models.ts — getModels() → listAllModels(),
  getDefaultModel(), getDefaultModelId().
- Created src/lib/nexus/judge.ts (server-only) — judgeNarratives(task,
  narratives[], model?) builds a judge prompt, calls askOnce, defensively
  parses JSON (tries raw, ```json fences, first {...} block), validates
  winner is a known id, falls back gracefully. Returns {winner, reasoning,
  scores, raw}.
- Created src/app/api/ai/chat/route.ts — POST {messages, model?, temperature?,
  systemPrompt?}. force-dynamic + nodejs runtime. Returns text/event-stream:
  `data: {"delta":"<chunk>"}\n\n` per token, `data: {"error":"<msg>"}\n\n`
  on error, `data: [DONE]\n\n` at end. ReadableStream with async start(),
  90s timeout handled inside streamComplete. Defaults model to
  getDefaultModelId() when omitted.
- Created src/app/api/ai/ask/route.ts — POST {prompt, model?}. force-dynamic.
  Returns {ok, answer, model, latencyMs} or {ok:false, error, model, latencyMs}.
- Created src/app/api/ai/models/route.ts — GET → {count, available, default,
  models} from getModels()+getDefaultModelId().
- Created src/lib/os/ai-stream.ts (client SSE helper) — streamChat({messages,
  model, systemPrompt, temperature, signal, onToken, onError}) POSTs
  /api/ai/chat (relative path), reads body via getReader()+TextDecoder,
  buffers, splits on \n\n, parses data: lines, routes delta→onToken /
  error→onError. fetchModels() → GET /api/ai/models. All paths RELATIVE
  (Caddy-friendly, no ports).
- Created src/apps/ai-chat.tsx ('use client') — ChatGPT-style chat:
  * Model picker = Popover + Command (cmdk) searchable combobox. Custom
    substring filter; each item value = lowercased composite of
    id+label+provider+providerLabel+tier+free/paid+description so typing
    "free" / "nvidia" / "glm" / "groq" / "flagship" all filter. Grouped
    by provider (zai first then alpha). Each row: availability dot +
    label + FREE badge + tier badge + description + check on current.
    Unavailable models shown but disabled.
  * Message list: user bubbles (cyber-cyan, right, monospace, no markdown),
    assistant bubbles (phosphor, left, react-markdown with code/pre/ul/ol/
    a/h1-3/blockquote/table overrides all themed via CSS vars). Blinking █
    cursor on the streaming assistant message (custom @keyframes
    nexusCursorBlink steps(2)). Auto-scroll sticks to bottom unless user
    scrolled up.
  * Input: auto-grow textarea (capped 180px), Enter sends / Shift+Enter
    newline. Send button (phosphor) swaps to Stop button (cyber-magenta)
    while streaming. AbortController cancels the fetch; AbortError is
    swallowed (not shown as error). Empty assistant bubbles dropped on
    finally.
  * Persistence: localStorage key 'nexus:ai-chat:v1' stores
    {messages, model, systemPrompt, temperature}; loaded on mount, saved
    on every change.
  * Header: model picker + New (clears, stops stream) + Settings gear.
    Settings Dialog: system prompt textarea + temperature Slider (0–2,
    step 0.05) with live readout.
  * Empty state: NEXUS block-letter ASCII logo (pre, phosphor-bright +
    glow) + "AI Chat · Multi-Provider LLM" subtitle + 4 suggested-prompt
    buttons (clicking sends immediately via send(prompt)).
  * registerApp({ id:'ai-chat' as AppId, name:'NEXUS AI', icon:'⬡',
    component:AiChatApp, defaultSize:{w:760,h:560}, minSize:{w:380,h:360},
    singleton:false, pinned:true, category:'ai', title:'NEXUS AI' }).
    NOTE: id cast to AppId because the AppId union (WAVE-1) lists
    'nexus-ai' not 'ai-chat' — used a local cast to avoid touching the
    shared types.ts. icon is a string glyph (AppDef.icon is typed string
    and desktop renders it as text), not a Lucide component. Did NOT
    touch src/apps/index.ts (orchestrator wires `import './ai-chat'`).
- Ran `bun run lint` once (global): 2 errors + 3 warnings, ALL in
  parallel-agent files (src/apps/browser.tsx, src/apps/code-editor.tsx,
  src/components/os/less-viewer.tsx, src/components/os/code-editor/worker.ts)
  — NOT in any WAVE-3B file. Re-ran eslint scoped to just my paths
  (src/lib/nexus, src/app/api/ai, src/lib/os/ai-stream.ts, src/apps/ai-chat.tsx)
  → ZERO output (clean).
- Confirmed dev.log shows ongoing `✓ Compiled` + `GET / 200` with no
  errors introduced by my files. ai-chat.tsx is not yet wired into
  src/apps/index.ts (orchestrator's job), so it won't appear on the
  desktop until that import is appended.

Stage Summary:
- src/lib/nexus/types.ts
- src/lib/nexus/providers/registry.ts
- src/lib/nexus/providers/openai-compat.ts
- src/lib/nexus/providers/zai.ts
- src/lib/nexus/providers/{openai,groq,cerebras,openrouter,mistral,novita,nvidia,qwen,opencodezen,kilocode}.ts
- src/lib/nexus/providers/index.ts
- src/lib/nexus/llm.ts
- src/lib/nexus/models.ts
- src/lib/nexus/judge.ts
- src/app/api/ai/chat/route.ts
- src/app/api/ai/ask/route.ts
- src/app/api/ai/models/route.ts
- src/lib/os/ai-stream.ts
- src/apps/ai-chat.tsx
- (handoff) agent-ctx/WAVE-3B-ai-chat.md

Counts: 11 providers, 50 models total (zai:5, openai:6, groq:5, cerebras:3,
openrouter:5, mistral:5, novita:5, nvidia:5, qwen:3, opencodezen:4, kilocode:4).
With all .env keys present, all 11 providers report available=true.

---
Task ID: WAVE-3C
Agent: WAVE-3C (Browser + BL/HB backend)
Task: Browser app + Browserless + Hyperbrowser backend routes

Work Log:
- Read CANON.md (full), WAVE-1 + WAVE-2 + WAVE-3B worklog sections,
  src/apps/registry.tsx, .env (BROWSERLESS_TOKEN + HYPERBROWSER_API_KEY
  + NEXUS_PUBLIC_BASE_URL all present), src/lib/os/types.ts (AppDef),
  src/components/os/window.tsx (window chrome — no keydown listener
  there), src/components/os/desktop.tsx (desktop uses Ctrl/Cmd+Space
  for launcher; doesn't swallow address-bar typing).
- Confirmed src/lib/nexus/ already created by WAVE-3B: llm.ts exports
  complete/askOnce/streamComplete (DEFAULT_MODEL was REMOVED —
  /api/agent/llm route from another wave currently 500s on that
  missing import; NOT my file). judge.ts does NOT exist yet — my BL
  agent route degrades gracefully via dynamic import + try/catch.
- Wrote src/lib/browserless.ts (server-only):
  - callBrowserless(endpoint, payload) with special cases per spec:
    content → {url} ONLY (strips raw/options/selector — BL 400s otherwise);
    scrape → {url, elements:[{selector ?? 'body'}]};
    screenshot → {url, options:{fullPage:true, type:'png'}};
    search → {query}; default → pass-through (pdf, function, …).
  - Base https://production-sfo.browserless.io, token as ?token= query.
  - Returns raw Response. Missing token → real 500 (no synthetic).
- Wrote src/lib/hyperbrowser.ts (server-only):
  - HB_BASE = 'https://api.hyperbrowser.ai' (NO /v1 — confirmed no 404).
  - callHB(path, init?) with x-api-key header.
  - hbScrape/hbSearch/hbStartAgent/hbPollAgent typed wrappers.
  - hbStartAgent reads parsed.jobId (NOT parsed.id — historical bug).
- Wrote src/app/api/browserless/route.ts (POST):
  - Body {endpoint, payload}. Streams upstream BL response with original
    content-type preserved (HTML/JSON/PNG/PDF all flow through).
  - force-dynamic, nodejs runtime.
- Wrote src/app/api/browserless/agent/route.ts (POST):
  - Body {task, n?, maxSteps?}. Fires N parallel BL /function calls
    (N capped 1..4, default 2; maxSteps capped 1..6, default 3).
  - 4 BoN strategies: summary / links / structure / data — each
    captures a different aspect of the page for variety.
  - buildFunctionCode(strategy) returns an ESM string:
      export default async ({page, context}) => { navigate → capture
      state → call /api/agent/llm (if reachable) → execute action →
      repeat up to maxSteps → return {strategy, narrative, steps,
      finalUrl, state} }
  - LLM endpoint = process.env.NEXUS_PUBLIC_BASE_URL + '/api/agent/llm',
    passed via context. If unreachable, function gracefully degrades:
    captures real page state and returns it as the narrative (REAL
    data, NOT synthetic).
  - CRITICAL FIX discovered during testing: BL /function rejects a
    top-level `url` field ("must NOT have additional properties").
    Removed `url` from payload; function navigates itself using
    context.startUrl.
  - Judge call is defensive: dynamic import('@/lib/nexus/judge'),
    try/catch. If module missing or doesn't export judgeNexus/judge/
    default, returns {ok:false, error:'judge-...'} (NOT a synthetic
    judgment).
  - Returns {ok, narratives[N], judgment}.
- Wrote src/app/api/hyperbrowser/scrape/route.ts (POST {url}):
  - Calls hbScrape → {ok, data:{markdown, html, raw}}.
- Wrote src/app/api/hyperbrowser/search/route.ts (POST {query}):
  - Calls hbSearch → {ok, results[], raw}.
- Wrote src/app/api/hyperbrowser/agent/route.ts (POST {task, model?,
  maxSteps?}): calls hbStartAgent → {ok, jobId, liveUrl}.
- Wrote src/app/api/hyperbrowser/agent/[id]/route.ts (GET):
  - Calls hbPollAgent(id). Maps HB step shape
    (data.steps[].agentOutput.thoughts + actions[].actionDescription)
    to our {index, thoughts, actions[]} format. Returns
    {ok, status, steps, finalResult, error, liveUrl, raw}.
- Wrote src/lib/os/browserless-client.ts (client):
  - fetchContent/scrape/screenshot/fetchPdf/search/runAgent with
    typed results + error handling. All POST to /api/browserless*.
- Wrote src/lib/os/hyperbrowser-client.ts (client):
  - hbScrape/hbSearch/startAgent/pollAgent/stopAgent with typed
    results. All POST/GET to /api/hyperbrowser/*.
- Wrote src/apps/browser.tsx ('use client'):
  - Engine toggle BL/HB persisted to localStorage('nexus:browser:engine').
  - Mode selector: SMART/SCRAPE/SCREENSHOT/PDF/SEARCH/RAW.
  - SMART (BL): /api/browserless {content} → HTML → blob URL iframe
    with sandbox="allow-scripts allow-forms allow-popups
    allow-popups-to-escape-sandbox allow-modals" + <base href> injected
    so relative resource URLs resolve against the source origin.
  - SMART (HB): /api/hyperbrowser/scrape → markdown → react-markdown
    in a clean SANS-SERIF container (NOT mono — mono made it "wavy"
    per spec). Custom component map: h1/h2/h3/p/a/code/pre/ul/ol/
    blockquote all themed via CSS vars.
  - SCRAPE: CSS selector input → BL scrape (flatten results[]) OR
    HB scrape (markdown). Renders JSON in a mono <pre>.
  - SCREENSHOT: BL screenshot → PNG blob → <img>. HB has no
    screenshot endpoint → BL fallback.
  - PDF: BL /pdf → blob → iframe.
  - SEARCH: auto-switched when input isn't a URL (isUrlLike check:
    http(s)://, bare domain, localhost). BL search OR HB search.
    Renders results list with title/url/snippet; click loads the URL.
  - RAW: MCP fetch via /api/mcp/call. Probes /api/mcp/tools on mount;
    disables the RAW button if MCP bridge unavailable.
  - Address bar: Back/Forward/Reload/Home + input + Go.
    CRITICAL: input has stopPropagation on onKeyDown/onKeyUp/onKeyPress
    so the Terminal's window-level keydown listener (WAVE-3B/3D, when
    it ships) won't swallow typing. Enter triggers onGo.
  - History stack (cap 50) with back/forward navigation.
  - Fallback panel for non-embeddable sites: Open in new tab /
    Screenshot / View HTML + collapsible raw HTML <details>.
  - Status bar: engine · mode · URL · load time (ms) · ERROR on fail.
  - registerApp({ id:'browser', name:'Browser', icon:'🌐', component:
    BrowserApp, defaultSize:{w:900,h:600}, minSize:{w:480,h:360},
    singleton:true, pinned:true, category:'network', title:'Browser' }).
- Ran `bun run lint` ONCE → my files clean (0 errors, 0 warnings).
  The 2 remaining errors + 2 warnings are in OTHER WAVE-3 agents' WIP
  files (code-editor.tsx, less-viewer.tsx, worker.ts) — NOT mine,
  left untouched per coordination protocol.
- End-to-end curl verification (all returned 200 with REAL upstream data):
  GET  /api/browserless                                    → service info
  POST /api/browserless {endpoint:content, payload:{url, raw, options}}
                                                            → real HTML (no 400 — confirms {url}-only forwarding)
  POST /api/browserless/agent {task, n:2, maxSteps:2}      → 2 real narratives from example.com + judgment (judge module not yet present → graceful {ok:false, error:'judge-function-not-found'})
  POST /api/hyperbrowser/scrape {url}                      → real markdown from HB (no 404 — confirms no /v1)
  POST /api/hyperbrowser/agent {task, maxSteps:2}          → {jobId, liveUrl} (confirms jobId read, not id)
  GET  /api/hyperbrowser/agent/{jobId}                     → {status, steps[], finalResult} with HB step shape mapped
- Did NOT modify src/apps/index.ts per spec ("Don't touch"). The
  registerApp call in browser.tsx is correct; the coordinator needs
  to append `import './browser'` to src/apps/index.ts to activate the
  app in the dock. (WAVE-2 worklog explicitly anticipated WAVE-3
  appending app imports.)

Stage Summary:
- src/lib/browserless.ts
- src/lib/hyperbrowser.ts
- src/app/api/browserless/route.ts
- src/app/api/browserless/agent/route.ts
- src/app/api/hyperbrowser/scrape/route.ts
- src/app/api/hyperbrowser/search/route.ts
- src/app/api/hyperbrowser/agent/route.ts
- src/app/api/hyperbrowser/agent/[id]/route.ts
- src/lib/os/browserless-client.ts
- src/lib/os/hyperbrowser-client.ts
- src/apps/browser.tsx
- (handoff) agent-ctx/WAVE-3C-browser.md

---
Task ID: WAVE-3A
Agent: WAVE-3A (Terminal)
Task: Terminal app + command engine + less pager

Work Log:
- Read CANON.md, WAVE-1 + WAVE-2 worklog, registry.tsx, types.ts,
  vfs.ts, fs-store, settings-store, agent-runs-store, sound.ts,
  music.ts, and the v4 reference (Terminal.tsx + commands.ts +
  LessViewer.tsx). Adapted v4 ideas (less pager keybindings, ghost
  completion, reverse-search, watch live command, now-playing bar)
  but did NOT copy — ported to the new types.ts CommandContext /
  CommandResult shapes (output/clear/openManual, NOT v4's lines/live/
  silent), the flat-id-map VFS, the settings/fs/agent-runs stores,
  and the registerApp pattern.
- Wrote src/components/os/less-viewer.tsx — 'use client'. Full-screen
  phosphor pager overlay. Props: { content, onClose, title? }.
  Keyboard (window-level listener): q/Esc close, ↑/↓/j/k line,
  PgUp/PgDn/Space/b page, g/Home top, G/End bottom, / opens search
  input, n/N cycle matches. Adjusting-state-during-render pattern to
  reset scroll on content change (lint-clean — no setState-in-effect).
  Phosphor styling via var(--phosphor) / var(--phosphor-dim) /
  var(--background). Matched line highlighted in inverted colors.
- Wrote src/lib/os/commands.ts — 'use client'. Command engine with
  48 commands across 7 categories (target was ~50):
    Navigation (4): ls, cd, pwd, tree
    File (13):    cat, touch, mkdir, rm, mv, cp, echo, find, grep,
                  head, tail, wc, less
    System (11):  clear, cls, help, man, whoami, date, uptime,
                  neofetch, about, history, reset, exit
    Settings (4): theme, crt, sound, wallpaper
    Fun (4):      cowsay, figlet (built-in 5x5 block font), fortune,
                  play
    Web (4):      fetch, scrape, screenshot, search  — REAL calls to
                  POST /api/browserless with { endpoint, payload }
    NEXUS (7):    ask (REAL /api/ai/ask), apps, open, status, nexus
                  (run/pipe/status/stop), sentinel
                  (start/list/stop/demo), watch
  Exports: COMMANDS, COMMAND_NAMES, MANUAL, tokenize,
  computeGhost (no-ctx), computeGhostWithCtx (path-aware),
  shortCwd, CommandDef, resolvePath (re-export).
  CommandContext shape conforms to types.ts. Web/AI commands are
  async. help returns { openManual: MANUAL }; less <file> returns
  { openManual: content }. watch uses ctx.pushLine for live streaming
  and registers a stop fn via ctx.registerStop.
  nexus/sentinel use useAgentRunsStore directly (startRun/updateStep/
  endRun) with auto-advancing demo steps.
  wallpaper uses useSettingsStore.setWallpaper directly (not in ctx).
  reset uses useFsStore.reset directly (not in ctx).
  Real /api/browserless calls verified against the existing route
  contract: { endpoint: 'content'|'scrape'|'screenshot'|'search',
  payload: { url | query } }. Response is parsed as JSON when
  content-type is application/json, else returned as raw text
  (screenshots return image/png bytes).
  Real /api/ai/ask call uses { prompt } → { ok, answer, model,
  latencyMs }; pickText helper falls back through answer/text/response/
  content/reply.
- Wrote src/apps/terminal.tsx — 'use client'. Terminal app:
  • Output scrollback (mono, phosphor, auto-scroll, capped at
    MAX_LINES=1000, oldest dropped).
  • Prompt: `${username}@nexus:${shortCwd(cwd)}$` (shortCwd rewrites
    /home/nexus → ~).
  • Input: native <input> (mobile-friendly, autocapitalize/autoCorrect
    off, spellCheck off). Ghost-completion text overlaid behind input
    via absolute-positioned span with opacity 0.55; input text color
    transparent when ghost is shown so the ghost renders cleanly.
  • CRITICAL window-level keydown listener: guarded with
    `if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
    t.isContentEditable)) return` so it never swallows typing in the
    Browser address bar or any other input. Its only job is to
    refocus the terminal's input on printable keys (when our window
    is the focused one) and handle Ctrl+L/Ctrl+R globally.
  • Command editing handled in the <input>'s own onKeyDown:
    Enter (execute), Tab (completion via computeGhostWithCtx),
    ArrowUp/Down (history), Ctrl+R (reverse-search — own UI mode),
    Ctrl+L (clear), Ctrl+C (cancel line or stop live), Ctrl+V
    (native paste), q/Esc (stop live command).
  • History persisted to localStorage 'nexus:history:v1' (max 200),
  read by the `history` command.
  • Sound: setSoundEnabled(sound) on settings change; playKeyClick
  on printable keydown when sound on; playBeep on command-not-found
  + on exceptions.
  • LessViewer overlay when command result has openManual (help,
  `less <file>`).
  • Now-playing bar at the bottom: subscribes to
  MusicPlayerInstance.on() — shows ♪ title — artist + 16-block
  progress meter + elapsed/total when playing; otherwise shows
  crt/sound/theme summary.
  • Welcome banner pushed on mount (NEXUS OS v5.0 + quick-start).
  • registerApp({ id: 'terminal', name: 'Terminal', icon:
  <TerminalSquare className="h-5 w-5" />, component: TerminalApp,
  defaultSize: {x:120,y:80,w:720,h:460}, minSize: {x:0,y:0,w:360,h:200},
  singleton: true, pinned: true, category: 'system' }) at module top
  level (after the component definition).
- Ran `bun run lint` once. Initial pass: 1 error in less-viewer.tsx
  (setState-in-effect on the content-reset effect) → fixed by
  switching to the adjusting-state-during-render pattern
  (prevContent comparison). Re-ran: my 3 files (less-viewer.tsx,
  commands.ts, terminal.tsx) all lint clean (exit 0 when scoped).
  Remaining full-project errors are in code-editor.tsx, notepad.tsx,
  and code-editor/worker.ts — those belong to parallel waves
  (WAVE-3B/C), not WAVE-3A. Did not touch them.
- Verified dev.log: /api/browserless POSTs returning 200; my calls
  use the existing route contract correctly. /api/ai/ask route
  exists and my ask command's response parsing (pickText keys
  ['text','answer','response','content','reply']) will pick up the
  `answer` field the route returns.

Stage Summary:
- src/components/os/less-viewer.tsx
- src/lib/os/commands.ts
- src/apps/terminal.tsx
- (handoff) agent-ctx/WAVE-3A-terminal.md

Handoff for orchestrator:
- The barrel `src/apps/index.ts` currently imports only './registry'.
  Add `import './terminal'` so the terminal self-registers on boot.
  (Per instructions, WAVE-3A did NOT touch the barrel.)
- AppDef.defaultSize / minSize in types.ts already supports optional
  x/y (confirmed) — the {x,y,w,h} object literal in the registerApp
  call type-checks correctly.
- The /api/ai/ask route returns { ok, answer, model, latencyMs };
  /api/browserless takes { endpoint, payload } and streams the
  upstream Browserless.io response. Both are called for real (no
  mocks) by the ask / fetch / scrape / screenshot / search commands.

---
Task ID: WAVE-3D
Agent: full-stack-developer (apps: code-editor + file-manager + notepad)
Task: Build 3 apps + launch-params + JS worker; register via registerApp.

Work Log:
- Read CANON.md, worklog (WAVE-1 + WAVE-2), src/apps/registry.tsx,
  src/lib/os/vfs.ts, src/stores/fs-store.ts, src/lib/os/types.ts,
  src/components/os/window.tsx, src/stores/window-store.ts,
  src/components/os/desktop.tsx, src/apps/index.ts.
- Type-system changes (src/lib/os/types.ts):
  - AppDef.icon: string -> React.ReactNode (so lucide-react elements
    AND emoji strings both work — backward-compatible).
  - AppDef.defaultSize / minSize now accept optional x,y
    ({ x?: number; y?: number; w: number; h: number }) — required
    for the WAVE-3D registration calls that pass window position.
  - AppId union: added 'file-manager' alongside 'files' (kept 'files'
    for any future wave that may register under that id).
- src/stores/window-store.ts: added 'file-manager': { w: 760, h: 500 }
  to DEFAULT_SIZES (required because Record<AppId, ...> is exhaustive).
- src/apps/registry.tsx openApp: now returns `string | undefined`
  (the opened/focused windowId) so callers can pair it with
  setLaunchParams. Backward-compatible — existing callers ignore the
  return value. Also passes x/y from AppDef.defaultSize into
  ws.openWindow (was previously dropped).
- Wrote src/lib/os/launch-params.ts — 'use client'. In-memory
  Map<windowId, Params> + lightweight subscribe/emit. Public API:
  setLaunchParams / getLaunchParams / takeLaunchParams (one-shot) /
  clearLaunchParams / useLaunchParams(windowId) React hook (backed by
  useSyncExternalStore with a per-windowId snapshot cache so stable
  values don't trigger re-renders).
- Wrote src/components/os/code-editor/worker.ts — Web Worker JS
  interpreter. Receives { code }, executes via
  `new Function('"use strict";\n' + code)` wrapped in try/catch.
  Console shim forwards log/info/warn/error/debug/trace → posts
  { type:'output', line, level }. Runtime errors →
  { type:'error', message }. Always ends with { type:'done' }.
  Stringify handles primitives, functions, symbols, circular refs,
  Error, Array, plain objects (JSON with function/symbol/bigint
  reviver). Loaded via
  `new Worker(new URL('../components/os/code-editor/worker.ts',
  import.meta.url))` from src/apps/code-editor.tsx.
- Wrote src/apps/code-editor.tsx — 'use client'. Full code editor:
  * Left sidebar: recursive VFS file tree (root → expand/collapse
    dirs). Click file loads; click dir toggles. Modified indicator
    `*` (amber) on the currently-open file when dirty. Per-file
    inline Trash2 button (visible on hover) deletes via fs-store
    (window.confirm).
  * Editor: textarea + Gutter (line numbers). Tab inserts 2 spaces.
    Ctrl/Cmd+S saves. Gutter scroll synced to textarea via ref
    (no React state per scroll event — bypasses React entirely).
  * Top bar: language <select> (JavaScript / TypeScript / Python
    stub) + filename (with dirty `*`) + New / Save / Run buttons.
  * Bottom: console panel with color-coded output (log green,
    info cyan, warn amber, error magenta, system dim). Clear button.
    Auto-scrolls to bottom on new output.
  * Run: spawns a fresh Worker per Run (terminated on 'done' or
    on unmount). Posts { code: content }. Python language shows
    "Python execution requires Pyodide" stub instead of running.
    TypeScript runs as-is via `new Function` (best-effort — TS type
    annotations will SyntaxError, which is reported in the console).
  * Language auto-detects from extension on file load
    (.ts/.tsx→typescript, .py→python, else javascript).
  * Opens files via launch-params (file-manager double-click).
    useLaunchParams(windowId) + useEffect on params.filePath loads
    the file then clearLaunchParams (so re-opening the same path
    later still triggers the effect). Confirms before discarding
    unsaved changes.
  * PERFORMANCE (critical):
    - TreeNode wrapped in React.memo. Receives stable props (node,
      path, depth, booleans, useCallback'd handlers). Skips
      re-render on parent re-render unless props actually change.
    - Gutter wrapped in React.memo. Props: lineCount + gutterRef
      (stable ref object). Only re-renders when lineCount changes
      — i.e. when a newline is added/removed. Typing within a line
      does NOT re-render the gutter.
    - ConsoleRow wrapped in React.memo. Props: line object
      (stable reference per render of parent, since unchanged rows
      keep the same object reference in the consoleLines array).
    - All handlers (handleSelect, handleToggle, handleDelete,
      handleNew, handleSave, handleClear, handleContentChange,
      handleScroll, handleKeyDown, handleRun, pushLine) are
      useCallback'd with proper deps.
    - lineCount derived via useMemo([content]).
    - Gutter scroll sync via direct ref manipulation (no state).
    - Net effect: typing only re-renders the textarea + parent.
      Memo'd children bail out via shallow prop comparison.
  * .py files: openable + editable (just text). Run shows the
    Pyodide stub message.
  * Registered: registerApp({ id:'code-editor', name:'Code Editor',
    icon:<Code2/>, defaultSize:{x:100,y:80,w:820,h:560},
    minSize:{x:0,y:0,w:480,h:320}, singleton:true, pinned:true,
    category:'dev' }).
- Wrote src/apps/file-manager.tsx — 'use client'. GUI file manager:
  * Left sidebar: quick locations (Home, Documents, Projects, /etc,
    /tmp) — click to navigate.
  * Breadcrumb address bar (click any segment to navigate).
  * Main: file/folder list. Folders render cyan with Folder icon;
    files green with extension-specific icon (FileCode/FileJson/
    FileText/File). Double-click folder navigates; double-click
    file opens in Notepad (.txt/.md + anything not code) or Code
    Editor (.js/.ts/.tsx/.py/.json) via openApp + setLaunchParams.
  * Toolbar: Back, Forward, Up, New Folder (prompt), New File
    (prompt), Refresh, Delete (operates on selected row).
  * Right-click context menu (shadcn ContextMenu) per row: Open,
    Rename, Copy Path (navigator.clipboard.writeText), Delete.
  * Rename inline: input replaces the filename; Enter commits,
    Esc cancels, blur commits. fs-store.rename.
  * Delete with shadcn AlertDialog confirm (different wording for
    dir vs file).
  * Status bar: item count + selected name + fs version.
  * Navigation: history stack with Back/Forward. Backspace = Up.
  * All ops via fs-store. Toasts (sonner) for success/error
    feedback.
  * Registered: registerApp({ id:'file-manager', name:'Files',
    icon:<FolderOpen/>, defaultSize:{x:80,y:60,w:760,h:500},
    minSize:{x:0,y:0,w:400,h:300}, singleton:true, pinned:true,
    category:'system' }).
- Wrote src/apps/notepad.tsx — 'use client'. Simple text editor:
  * Menu bar: File (New, Open…, Save, Save As…), Edit (Find…),
    Help (About Notepad, Open Files app). Custom dropdown menus
    (MenuButton + MenuItem + MenuSeparator primitives). Closes on
    outside click or Esc.
  * Full-height textarea (mono, phosphor-bright).
  * Find bar: input + Prev/Next + match counter. Enter=Next,
    Shift+Enter=Prev, Esc=close. Highlights match via
    setSelectionRange.
  * Status bar: Ln/Col (updated on select/click/keyup), char count,
    line count, Modified/Saved indicator, full file path.
  * Ctrl+S = Save, Ctrl+F = Find.
  * Opens via launch-params (filePath) from file-manager. Same
    useLaunchParams + clearLaunchParams pattern as code-editor.
  * Save: fs-store.writeFile (creates if missing). Save As prompts
    for path. New discards buffer (with confirm if dirty).
  * Non-singleton — each instance is a fresh window.
  * Registered: registerApp({ id:'notepad', name:'Notepad',
    icon:<StickyNote/>, defaultSize:{x:120,y:80,w:600,h:440},
    minSize:{x:0,y:0,w:300,h:200}, singleton:false, pinned:false,
    category:'apps' }).
- Verified lucide-react icon availability: Code2 (alias of CodeXml),
  Home (alias of House), Loader2 (alias of LoaderCircle) all exist.
  SaveAs does NOT exist — swapped to SaveAll in notepad's Save As
  menu item.
- Did NOT modify src/apps/index.ts (per instruction).
- Ran `bun run lint` once.

Stage Summary:
- src/lib/os/types.ts (modified — AppDef.icon + defaultSize/minSize,
  AppId union + 'file-manager')
- src/stores/window-store.ts (modified — DEFAULT_SIZES + 'file-manager')
- src/apps/registry.tsx (modified — openApp returns windowId, passes
  x/y from AppDef.defaultSize)
- src/lib/os/launch-params.ts (new)
- src/components/os/code-editor/worker.ts (new)
- src/apps/code-editor.tsx (new)
- src/apps/file-manager.tsx (new)
- src/apps/notepad.tsx (new)
- (handoff) agent-ctx/WAVE-3D-apps.md

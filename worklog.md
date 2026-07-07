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

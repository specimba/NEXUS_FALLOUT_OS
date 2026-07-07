# WAVE-2 — Shell (Boot / Lock / Desktop / Window / Registry / Page flow)

Agent: full-stack-developer (shell)
Task ID: WAVE-2
Status: COMPLETE

## Files produced (7)
1. `src/apps/registry.tsx` — App registry. `Map<string, AppDef>` backed by
   `useSyncExternalStore`. Exports `registerApp`, `getApp`, `listApps`,
   `useApps`, `openApp`, and re-exports `AppDef`/`AppCategory`/`AppId`/
   `WindowComponentProps`. `openApp(id)` reads the AppDef for title +
   default geometry + singleton behaviour and delegates to
   `useWindowStore.getState().openWindow(...)`. Singleton apps focus the
   existing window instead of opening a duplicate.
2. `src/apps/index.ts` — Barrel. Currently `import './registry'` only;
   WAVE-3 will append `import './terminal'`, `import './nexus-ai'`, etc.
3. `src/components/os/boot-screen.tsx` — Phosphor boot sequence. Plays 7
   boot lines progressively (60–140ms each), then NEXUS ASCII art, then
   "boot complete — entering lock screen". Auto-advances to lock at
   ~4.5s; any key/click/touch skips immediately. **BAKED-IN scanlines**
   (self-contained `repeating-linear-gradient` + radial vignette overlay
   div, `pointer-events-none`, z-20) so the CRT aesthetic shows from
   first paint WITHOUT depending on CRTOverlay hydrating from the
   settings store. Uses `var(--phosphor)`, `var(--phosphor-bright)`,
   `var(--phosphor-glow)` (double text-shadow 6px + 12px),
   `var(--background)`/`var(--bg-deep)` radial bg.
4. `src/components/os/lock-screen.tsx` — Pip-Boy lock screen. Large
   NEXUS ASCII wordmark, live clock (Share Tech Mono, updates every 1s
   via `useSyncExternalStore`), ACCESS CODE password input +
   AUTHENTICATE button. **Any non-empty password unlocks** (visual-only
   auth). Hint "TRY 'nexus'". Empty submit → magenta "ACCESS DENIED" +
   shake animation. ROBCO Industries footer. BAKED-IN scanlines (same
   pattern as boot screen). All colours via CSS vars.
5. `src/components/os/window.tsx` — Draggable + resizable window chrome.
   Header bar (title + min/max-restore/close controls) drags via
   pointer events, bounds-checked (can't drag above the 32px taskbar).
   Bottom-right handle resizes (clamped to 280×180 min). Maximize =
   full viewport minus taskbar + dock reserve; restore returns to
   `prevState` snapshot (from window-store). Minimized windows render
   `null`. Click anywhere → `focusWindow` (bumps z). framer-motion
   open/close (scale 0.92→1 spring). Mobile (≤640px) auto-maximizes on
   first mount. Focused window gets a brighter border + phosphor
   box-glow. All colours via CSS vars.
6. `src/components/os/desktop.tsx` — Full-viewport desktop. Wallpaper
   from settings-store (`WALLPAPERS[wallpaper].css`). Top TASKBAR
   (NEXUS wordmark → launcher, running-window pills, theme indicator,
   CRT toggle, sound toggle, live HH:MM clock). Bottom DOCK (centered,
   pinned apps + running-but-unpinned; running apps get a phosphor
   glow dot; click toggles focus/minimize or opens). APP LAUNCHER via
   shadcn `CommandDialog` (cmdk) — Ctrl/Cmd+Space toggles, Esc closes,
   fuzzy search over app name/id/category. Desktop icons (top-left,
   double-click to open). Right-click context menu (Open Terminal,
   Change Wallpaper, Settings, About). Auto-opens Terminal 250ms
   after first mount. All colours via CSS vars.
7. `src/app/page.tsx` — Phase flow root. Reads `phase` from os-store;
   renders `<BootScreen/>` / `<LockScreen/>` / `<Desktop/>`. Calls
   `rehydrateSettings()` + `rehydrateFs()` on mount (idempotent with
   ThemeApplier's call).

## Key design decisions for downstream waves
- **App registration is side-effect-on-import.** WAVE-3 app modules
  (e.g. `src/apps/terminal.tsx`) must call `registerApp({...})` at
  module top level (or in a `registerApp` invocation right after the
  component definition). Then append `import './terminal'` to
  `src/apps/index.ts`. The desktop already does `import '@/apps'`, so
  the barrel loads and all apps self-register before the desktop
  renders its dock/launcher.
- **No apps registered at end of WAVE-2.** The dock shows "No apps —
  press Ctrl+Space" and `openApp('terminal')` is a graceful no-op
  until WAVE-3 registers Terminal. This is expected.
- **Clocks use `useSyncExternalStore`**, not `useState`+`useEffect`.
  This is the lint-clean (no `set-state-in-effect` violation) AND
  SSR-safe (server snapshot = 0 → `null` → placeholder) pattern.
  Lock screen polls every 1s with second precision; desktop polls
  every 5s with minute precision. `now` is derived during render.
- **BAKED-IN scanlines** on boot + lock screens: a self-contained
  overlay div with `repeating-linear-gradient` + radial vignette,
  completely independent of `<CRTOverlay/>` (which only renders after
  the settings store rehydrates). This guarantees the CRT look from
  the very first paint of the boot screen.
- **Window focus styling** reads `focusedId` reactively from
  window-store (not `getState()` in render) so focus changes
  re-render the window chrome.
- **All colours via CSS vars** — `var(--phosphor)`,
  `var(--phosphor-bright)`, `var(--phosphor-dim)`, `var(--bg-deep)`,
  `var(--card)`, `var(--border)`, `var(--accent)`, `var(--cyber-magenta)`
  for error states. `rgba(0,0,0,…)` literals are used only inside
  scanline/box-shadow gradient stops (no `#` hex literals anywhere —
  confirmed by `rg '#'` returning nothing).
- **Z-layering**: taskbar + dock = z-[200], launcher dialog (radix) =
  z-[150] (default), context menu overlay = z-[250], menu = z-[260],
  windows = z from window-store (starts at 10, bumps on focus). The
  boot/lock screens sit at z-50/z-40 (below the global CRTOverlay at
  z-[100], which is correct — CRT covers everything).
- **Mobile**: dock wraps (`flex-wrap`), taskbar hides the running-window
  pills + theme label on `<sm`, windows auto-maximize on mount.

## Lint
`bun run lint` → exit 0, no errors, no warnings.

## Dev server
`dev.log` shows repeated `✓ Compiled in …` + `GET / 200` after the new
files were written — no compile or runtime errors introduced.

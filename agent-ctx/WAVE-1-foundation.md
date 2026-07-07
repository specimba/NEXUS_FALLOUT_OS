# WAVE-1 — Foundation (Theme + VFS + Stores + Types)

Agent: full-stack-developer (foundation)
Task ID: WAVE-1
Status: COMPLETE

## Files produced (14)
1. `src/app/globals.css` — bio-pip-cyberpunk vars + [data-theme] hooks + CRT utilities
2. `src/components/theme-provider.tsx` — next-themes wrapper
3. `src/components/os/crt-overlay.tsx` — CRT overlay (reads settings store)
4. `src/components/os/theme-applier.tsx` — writes data-theme / data-crt-quality / crt-disabled on <html>
5. `src/app/layout.tsx` — Share Tech Mono + JetBrains Mono + ThemeProvider + CRTOverlay + ThemeApplier + Toaster
6. `src/lib/os/types.ts` — all OS types (FSNode, FSMap, WindowState, AppDef, CommandContext, AgentRun, etc.)
7. `src/lib/os/vfs.ts` — pure-function flat-id-map VFS + createDefaultFS()
8. `src/stores/settings-store.ts` — Zustand + persist ('nexus:settings:v2', skipHydration)
9. `src/stores/os-store.ts` — Zustand (not persisted): phase boot/lock/desktop
10. `src/stores/window-store.ts` — Zustand (not persisted): window manager
11. `src/stores/fs-store.ts` — Zustand + persist ('nexus:fs:v1', skipHydration): VFS wrapper
12. `src/stores/agent-runs-store.ts` — Zustand (not persisted): agent runs
13. `src/lib/os/sound.ts` — Web Audio click+beep synth singleton
14. `src/lib/os/music.ts` — Web Audio chiptune, 5 songs, MusicPlayerInstance singleton

## Key design decisions for downstream waves
- **Theme propagation**: ThemeApplier writes `data-theme` + `data-crt-quality` +
  `--crt-scanline-opacity` + `.crt-disabled` on `<html>`. CSS vars cascade.
  NEVER hardcode color literals in components — always use `var(--phosphor)`
  / `bg-phosphor` / `text-phosphor-bright` etc.
- **SSR safety**: settings-store + fs-store use `skipHydration: true`.
  ThemeApplier calls `rehydrateSettings()` on mount. First client render
  matches SSR (defaults), then rehydration applies user prefs. Downstream
  components that read fs-store directly should call `rehydrateFs()` from a
  client effect once (e.g. in the desktop component), or gate on the
  `hasHydrated` flag.
- **VFS is pure**: `src/lib/os/vfs.ts` functions return new FSMap. The
  fs-store wraps them and bumps `version` for reactivity. To subscribe to
  FS changes outside React, read `useFsStore.getState().version`.
- **Window manager**: `openWindow(appId, opts?)` returns the new window id.
  DEFAULT_SIZES per AppId lives in window-store.ts. App registry (next wave)
  should populate the AppDef.component field.
- **AppId union** (in types.ts): `'terminal' | 'nexus-ai' | 'browser' |
  'settings' | 'command-center' | 'web-agent' | 'files' | 'code-editor' |
  'notepad'` — 9 apps, matches CANON.md §4.
- **HOME** = `/home/nexus`, exported from both vfs.ts and fs-store.ts.

## .env status
Currently only `DATABASE_URL=file:/home/z/my-project/db/custom.db` is set.
The brief mentions many provider keys (BROWSERLESS_TOKEN,
HYPERBROWSER_API_KEY, NOVITA_API_KEY, OPENAI_API_KEY, GROQ_API_KEY,
CEREBRAS_API_KEY, OPENROUTER_API_KEY, MISTRAL_API_KEY, NVIDIA_NIM_API_KEY,
QWEN_API_KEY, OPENCODE_ZEN_API_KEY, KILOCODE_API_KEY,
NEXUS_LLM_GATEWAY_TOKEN, NEXUS_PUBLIC_BASE_URL, MCP_BRIDGE_URL) — these are
NOT present. WAVE-1 doesn't use them, but downstream LLM/browser/MCP waves
will need them added to `.env` before they can call real upstreams.

## Lint
`bun run lint` — see worklog.md for final result.

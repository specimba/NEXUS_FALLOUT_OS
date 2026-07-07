# WAVE-3A — Terminal app + command engine + less pager

Agent: WAVE-3A (Terminal)
Task ID: WAVE-3A
Status: COMPLETE

## Files produced (3)
1. `src/components/os/less-viewer.tsx` — 'use client' `less`-style pager.
   Props `{ content, onClose, title? }`. Phosphor styling on
   `var(--background)`. Keyboard (window-level keydown listener):
   - `q` / `Esc` — close
   - `↑`/`↓`/`j`/`k` — line up/down
   - `PgUp`/`PgDn`/`Space`/`b`/`f` — page up/down
   - `g`/`Home` — top ; `G`/`End` — bottom
   - `/` — open search input ; `n`/`N` — cycle matches
   Adjusting-state-during-render pattern resets scroll on content
   change (lint-clean — no `setState` in effect).

2. `src/lib/os/commands.ts` — 'use client'. Command engine.
   **48 commands** across 7 categories (~50 target):
   - Navigation (4): `ls`, `cd`, `pwd`, `tree`
   - File (13): `cat`, `touch`, `mkdir`, `rm`, `mv`, `cp`, `echo`,
     `find`, `grep`, `head`, `tail`, `wc`, `less`
   - System (12): `clear`, `cls`, `help`, `man`, `whoami`, `date`,
     `uptime`, `neofetch`, `about`, `history`, `reset`, `exit`
   - Settings (4): `theme`, `crt`, `sound`, `wallpaper`
   - Fun (4): `cowsay`, `figlet`, `fortune`, `play`
   - Web (4): `fetch`, `scrape`, `screenshot`, `search` — REAL
     `POST /api/browserless` with `{ endpoint, payload }`
   - NEXUS (7): `ask` (REAL `/api/ai/ask`), `apps`, `open`, `status`,
     `nexus` (run/pipe/status/stop), `sentinel`
     (start/list/stop/demo), `watch`
   Exports: `COMMANDS`, `COMMAND_NAMES`, `MANUAL`, `tokenize`,
   `computeGhost` (no-ctx), `computeGhostWithCtx` (path-aware),
   `shortCwd`, `CommandDef`, re-exports `resolvePath`.
   `CommandContext` shape conforms to `src/lib/os/types.ts`
   (output/clear/openManual, NOT v4's lines/live/silent). All web/AI
   commands are `async`. `help` returns `{ openManual: MANUAL }`;
   `less <file>` returns `{ openManual: content }`.
   `watch` uses `ctx.pushLine` for live streaming and registers a
   stop fn via `ctx.registerStop`. `nexus`/`sentinel` use
   `useAgentRunsStore` directly (startRun/updateStep/endRun) with
   auto-advancing demo steps. `wallpaper` uses
   `useSettingsStore.setWallpaper` directly (not in ctx). `reset`
   uses `useFsStore.reset` directly.

3. `src/apps/terminal.tsx` — 'use client'. Terminal app.
   - Output scrollback (mono, phosphor, auto-scroll, capped at
     `MAX_LINES=1000`).
   - Prompt: `${username}@nexus:${shortCwd(cwd)}$` (shortCwd
     rewrites `/home/nexus` → `~`).
   - Native `<input>` (mobile-friendly, autocapitalize/autoCorrect/
     spellCheck off). Ghost-completion text overlaid behind the
     input via an absolute-positioned span (opacity 0.55); input
     text color transparent when ghost is shown so the ghost
     renders cleanly.
   - **CRITICAL window-level keydown listener** guarded with
     `if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
     || t.isContentEditable)) return` — never swallows typing in
     the Browser address bar or any other input anywhere in the
     app. Its only job is to refocus the terminal's input on
     printable keys (when our window is the focused one) and to
     handle Ctrl+L/Ctrl+R globally.
   - Command editing handled in the `<input>`'s own `onKeyDown`:
     Enter (execute), Tab (completion via `computeGhostWithCtx`),
     ArrowUp/Down (history), Ctrl+R (reverse-search — own UI mode
     with a separate search <input>), Ctrl+L (clear), Ctrl+C
     (cancel line or stop live command), Ctrl+V (native paste),
     q/Esc (stop live command).
   - History persisted to `localStorage 'nexus:history:v1'` (max
     200), read by the `history` command.
   - Sound: `setSoundEnabled(sound)` on settings change;
     `playKeyClick` on printable keydown when sound on; `playBeep`
     on command-not-found + on exceptions.
   - `<LessViewer>` overlay when a command result has `openManual`
     (`help`, `less <file>`).
   - Now-playing bar at the bottom: subscribes to
     `MusicPlayerInstance.on()` — shows `♪ title — artist` + a
     16-block progress meter + elapsed/total when playing;
     otherwise shows crt/sound/theme/command-count summary.
   - Welcome banner pushed on mount (NEXUS OS v5.0 + quick-start
     tips).
   - `registerApp({ id: 'terminal', name: 'Terminal', icon:
     <TerminalSquare className="h-5 w-5" />, component: TerminalApp,
     defaultSize: {x:120,y:80,w:720,h:460}, minSize:
     {x:0,y:0,w:360,h:200}, singleton: true, pinned: true,
     category: 'system' })` at module top level (after the
     component definition).

## Key design decisions
- **No new types.ts changes were needed.** The existing
  `CommandContext` (with `fs`, `writeFile`, `createDir`, `remove`,
  `move`, `copy`, `pushLine`, `clearLines`, `registerStop`,
  `theme`/`setTheme`, `crt`/`setCrt`, `sound`/`setSound`,
  `username`, `openApp`) is sufficient. `wallpaper` and `reset`
  reach into their stores directly instead of extending ctx (cleaner
  — keeps the type stable for downstream waves).
- **Native `<input>` instead of v4's hand-rolled cursor.** The v5
  spec requires mobile-friendliness, so a real input element drives
  editing. The window-level listener ONLY refocuses / handles
  global hotkeys; it never intercepts typing. The INPUT/TEXTAREA
  guard is the critical safety net.
- **LessViewer as an overlay, not a separate route.** It renders
  absolutely-positioned inside the terminal's root div with
  `z-40`, so it stacks above the scrollback but below the window
  chrome (z-50 from window.tsx header). No window-store interaction
  needed — purely local UI state.
- **watch command re-reads fs/cwd from the store on every tick**
  so file mutations made between ticks are visible. Sub-commands
  that would open a viewer (`help`, `less`) are skipped with a
  notice in watch mode.
- **Music player subscription via `MusicPlayerInstance.on()`** —
  the singleton already exists in `src/lib/os/music.ts`; the
  terminal just subscribes on mount and unsubscribes on unmount.
- **Ghost-completion overlay** uses an absolute-positioned span
  with the input text + ghost suffix; the input itself has
  transparent text color while ghost is non-empty so the ghost
  shows through cleanly. The caret remains visible via
  `caretColor`.
- **All colours via CSS vars** — `var(--phosphor)`,
  `var(--phosphor-bright)`, `var(--phosphor-dim)`,
  `var(--background)`, `var(--border)`, `var(--cyber-magenta)`
  for errors. No hardcoded hex literals.

## Handoff for the orchestrator
- **The barrel `src/apps/index.ts` needs `import './terminal'`
  appended** so the terminal self-registers on boot. Per the
  WAVE-3A instructions, the barrel was NOT touched.
- **`AppDef.defaultSize` / `minSize` already accept optional x/y**
  (confirmed in `src/lib/os/types.ts` line 73-75). The
  `{x,y,w,h}` object literal in the registerApp call type-checks
  correctly — no types.ts changes were needed.
- **Real API routes used (no mocks):**
  - `POST /api/browserless` with `{ endpoint: 'content'|'scrape'|
    'screenshot'|'search', payload: { url | query } }` — the
    route exists and proxies to Browserless.io. Verified in
    `dev.log`: `POST /api/browserless 200 in 1206ms`.
  - `POST /api/ai/ask` with `{ prompt }` → `{ ok, answer, model,
    latencyMs }`. The route exists at
    `src/app/api/ai/ask/route.ts`. My `ask` command's `pickText`
    helper looks at `['text','answer','response','content','reply']`
    and will pick up the `answer` field the route returns.
- **Web command response shapes are defensive.** BL `/content`
  returns JSON `{ title, content, ... }`; `/scrape` returns
  `{ results: [{ html, text, ... }] }`; `/screenshot` returns
  raw PNG bytes (content-type `image/png`); `/search` returns
  `{ organicResults: [...] }` or `{ results: [...] }`. All four
  commands handle JSON, raw text, and missing keys gracefully.

## Lint
`bun run lint` (scoped to WAVE-3A files):
```
npx eslint src/components/os/less-viewer.tsx \
           src/lib/os/commands.ts \
           src/apps/terminal.tsx   → exit 0
```
Initial pass had 1 error in `less-viewer.tsx` (setState-in-effect
on the content-reset effect) → fixed by switching to the
adjusting-state-during-render pattern (prevContent comparison).

Full-project `bun run lint` still reports 2 errors + 2 warnings —
all in `src/apps/code-editor.tsx`, `src/apps/notepad.tsx`, and
`src/components/os/code-editor/worker.ts`. Those files belong to
parallel waves (WAVE-3B/C), NOT WAVE-3A. Did not touch them.

## Dev server
`dev.log` shows `POST /api/browserless 200` and
`POST /api/hyperbrowser/* 200` from parallel-wave testing. The
terminal app itself isn't loaded yet (the barrel hasn't been
updated by the orchestrator), so no compile errors are
attributable to WAVE-3A. Once `import './terminal'` is added to
`src/apps/index.ts`, the desktop will auto-open the Terminal
window on mount (per WAVE-2's desktop.tsx).

## Command count
**48 commands** registered in `COMMANDS`:
about, apps, ask, cat, cd, clear, cls, cowsay, cp, crt, date,
echo, exit, fetch, figlet, find, fortune, grep, head, help,
history, less, ls, man, mkdir, mv, neofetch, nexus, open, play,
pwd, reset, rm, scrape, screenshot, search, sentinel, sound,
status, tail, theme, touch, tree, uptime, wallpaper, watch, wc,
whoami.

# NEXUS OS — Design Canon (Rebuild v2)

## 1. Aesthetic: Bio-Pip-Cyberpunk
Phosphor Pip-Boy green + cyberpunk. NOT flat bright green.

**Palette (CSS vars in `:root`):**
- `--phosphor: #33ff66` (primary), `--phosphor-bright: #7dffa6`, `--phosphor-dim: #1f6b33`, `--phosphor-deep: #12401f`, `--phosphor-glow: rgba(51,255,102,0.5)`
- `--pip-amber: #ffb000`, `--cyber-magenta: #ff2a6d`, `--cyber-cyan: #05d9e8`
- `--background: #020a02`, `--bg-deep: #010501`, `--card: #05140a`, `--border: #12401f`
- `--radius: 0.125rem` (sharp corners)

**Theme variants** via `[data-theme='amber'|'cyan'|'white']` on `<html>` — swap `--phosphor` + derived.

**Fonts:** Share Tech Mono (`--font-display`) + JetBrains Mono (`--font-mono`).

**CRT:** scanlines (repeating-linear-gradient) + vignette + slow flicker + beam. Driven by settings store. Quality tiers: static/subtle/full.

## 2. Tech Stack
- Next.js 16 App Router, TypeScript strict, Tailwind CSS 4, shadcn/ui (New York)
- Zustand stores (settings, os-phase, windows, fs, agent-runs)
- API routes (NOT server actions) for all backend
- z-ai-web-dev-sdk for LLM (preinstalled) + 10 OpenAI-compat providers (keys in .env)
- Browserless + Hyperbrowser for browser automation
- socket.io mini-service on :3003 for Command Center

## 3. Architecture
- `src/app/layout.tsx` — fonts + ThemeProvider + CRTOverlay + ThemeApplier + suppressHydrationWarning on html+body
- `src/app/page.tsx` — boot→lock→desktop phase flow (uses os-store)
- `src/components/os/` — boot-screen, lock-screen, desktop, window, crt-overlay, theme-applier, theme-provider
- `src/apps/` — 9 apps + registry.tsx + index.ts barrel
- `src/stores/` — settings, os, window, fs, agent-runs
- `src/lib/os/` — vfs, types, commands, sound, music, procedural-memory, browserless-client, hyperbrowser-client, mcp-client
- `src/lib/nexus/` — llm, models, judge, providers/ (11 providers)
- `src/lib/` — browserless.ts, hyperbrowser.ts, novita.ts (server-only)
- `src/app/api/` — ai/{chat,ask,models}, browserless/{,bql,agent}, hyperbrowser/{scrape,search,agent}, mcp/{tools,call}, novita/{provision,run,repl,agent}, agent/{llm,reflect,judge}

## 4. Apps (9)
Terminal, NEXUS AI (chat), Browser, Settings, Command Center, Web Agent, Files, Code Editor, Notepad

## 5. Key Lessons (apply this time)
- `suppressHydrationWarning` on BOTH `<html>` AND `<body>` (browser extensions inject attrs)
- Theme propagation: ThemeApplier writes `data-theme` to `<html>` → CSS vars cascade. NO hardcoded color literals in components — always `var(--phosphor)` etc.
- Terminal window-level keydown: guard against INPUT/TEXTAREA targets (don't swallow Browser address bar typing)
- API routes: call REAL upstream APIs, NEVER synthetic stubs
- Browserless /content: strip client-only fields (`raw`) before forwarding
- Hyperbrowser base URL: `https://api.hyperbrowser.ai` (NO `/v1`)
- Web Agent HB: call /api/hyperbrowser/agent (real), NOT /api/agent/run (synthetic)
- CRT overlay: render nothing when `crt=false`; field names are `crt`, `crtQuality`, `scanlines` (NOT crtEnabled/scanlineIntensity)
- Commit to git after every wave + tag for rollback

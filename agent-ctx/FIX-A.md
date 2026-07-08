# FIX-A — Two critical fixes (terminal silent commands + HB llm enum)

Agent: FIX-A
Task ID: FIX-A
Scope: (1) Make `status` / `sentinel demo` terminal commands produce visible
output; change default cwd to `/home/nexus`; echo pwd after `cd`. (2) Fix the
Web Agent -> HyperBrowser 400 "Invalid enum value" by omitting `llm` for
non-HB models.

## Environment note (important context for downstream agents)

When FIX-A started, the main project at `/home/z/my-project/src/` was still
the default shadcn scaffold (page.tsx was just the Z.ai logo). The actual
NEXUS shell source lived only in `upload/_extracted_shell_v4/src/`. The task's
path references (`src/lib/os/commands.ts`, `src/stores/fs-store.ts`,
`src/app/api/hyperbrowser/agent/route.ts`) assumed the project had already
been merged into the main tree.

FIX-A's first step was therefore to copy the project files from
`upload/_extracted_shell_v4/src/` into `/home/z/my-project/src/` (overwriting
the default `page.tsx`, `layout.tsx`, `globals.css`, `api/route.ts` with the
extracted versions) plus `prisma/schema.prisma`. After the copy the dev server
has a real terminal to serve.

The task's specific diagnosis (statusCmd calling `listApps()` /
`MusicPlayerInstance.currentSong()` / `useAgentRunsStore.getState().runs`,
and a `fs-store.ts`) did NOT match the actual codebase — the real `statusCmd`
lives in `src/lib/os/nexus-commands.ts` and calls `getStatus()` from
`@/lib/nexus/brain`; the cwd lives in `Terminal.tsx` state + the `vfs.ts`
seed tree, not a zustand store. FIX-A applied the *intent* of each fix to the
actual code.

## Bug 1 — terminal silent commands

### Root cause
- `status` is registered via `...NEXUS_COMMANDS` in `commands.ts` and calls
  `statusCmd()` -> `getStatus()` (a pure brain getter). It should produce
  output, but if `getStatus()` ever threw, `statusCmd` had no try/catch, so
  the throw bubbled to `Terminal.tsx`'s `execute()` catch block which prints
  `sh: status: <message>`. If the error message was empty/non-Error the line
  looked blank — matching the user's "no output, no error" report.
- `sentinel` / `sentinel demo` did not exist as a command at all, so typing it
  produced `sh: sentinel: command not found` (or nothing if the registry had a
  gap). Either way, no real output.
- Default cwd was `/home/user` (seeded in `vfs.ts`), which is fine, but the
  task wanted `/home/nexus` so `ls` shows the home files immediately.

### Fixes applied
1. `src/lib/os/vfs.ts` — seed tree renamed `/home/user` -> `/home/nexus`
   (dir key + name); `etc/os-release` `HOME=` updated to `/home/nexus`.
2. `src/components/os/Terminal.tsx` — initial `cwd` state `/home/user` ->
   `/home/nexus`; `shortCwd()` `~` mapping updated; `resetVfs()` resets to
   `/home/nexus`.
3. `src/lib/os/commands.ts` — `cd()` default `/home/user` -> `/home/nexus`;
   `cd()` now echoes the new working directory (`return { lines: [{ text: p,
   kind: 'dim' }] }`) so the user sees where they landed; man-page + help
   strings updated.
4. `src/lib/os/nexus-commands.ts` — `statusCmd()` rewritten to wrap the
   `getStatus()` call + row building in try/catch. On failure it still
   returns a box with `[partial] status data unavailable: <msg>` so the
   command never throws to `execute()` and always renders visible output.
5. `src/lib/os/nexus-commands.ts` — added `sentinelCmd(args)` with `status`
   and `demo` subcommands (demo renders a full SENTINEL scan box with
   signatures, perimeter sweep, integrity hashes, advisories). Registered as
   `sentinel` in `NEXUS_COMMANDS` with tab-completion for `status`/`demo`.

### Catch block verification
`Terminal.tsx` `execute()` catch block (lines ~350-352) already pushes a
visible error line:
```ts
} catch (e) {
  pushLines([{ text: `sh: ${name}: ${(e as Error).message}`, kind: 'error' }])
  playBeep(180, 0.1, 0.08)
}
```
This is correct — it does surface errors. The silent-failure risk was that a
throwing command would print `sh: status: ` (near-blank) if the error had no
message. The try/catch inside `statusCmd` now guarantees a real box renders
regardless.

## Bug 2 — HB agent route 400 (wrong llm enum)

### Root cause
The Web Agent sent the NEXUS model id (e.g. `zai:glm-5.2`) verbatim as the
`llm` field to HB's `/api/task/hyper-agent`. HB's `llm` is a fixed enum and
rejects anything else with HTTP 400 `llm - Invalid enum value`.

### Fix applied
Created `src/app/api/hyperbrowser/agent/route.ts`:
- Defines `HB_ALLOWED_LLM` Set with the 14 HB-supported models.
- `nativeModelId(model)` strips the provider prefix
  (`"zai:glm-5.2"` -> `"glm-5.2"`; equivalent to
  `model.split(':').slice(1).join(':')`).
- `buildHbBody()` deletes the NEXUS `model` field, then ONLY re-adds `llm =
  native` when `HB_ALLOWED_LLM.has(native)`. For every other provider
  (zai:, groq:, openrouter:, …) `llm` is omitted entirely so HB falls back to
  its default model.
- POST handler validates `prompt`, reads `HYPERBROWSER_API_KEY` /
  `HB_API_KEY`, forwards to `https://api.hyperbrowser.ai/api/task/hyper-agent`
  with `x-api-key`, and returns HB's response (or a clean error).
- GET handler documents the bridge and lists allowed llms.

### Relevant code
```ts
const HB_ALLOWED_LLM = new Set<string>([
  'gpt-5.5','gpt-5.2','gpt-5.1','gpt-5','gpt-5-mini',
  'gpt-4o','gpt-4o-mini','gpt-4.1','gpt-4.1-mini',
  'claude-sonnet-5','claude-sonnet-4-6','claude-sonnet-4-5',
  'gemini-2.5-flash','gemini-3-flash-preview',
])

function nativeModelId(model: string): string {
  const idx = model.indexOf(':')
  return idx === -1 ? model : model.slice(idx + 1)
}

function buildHbBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = { ...input }
  const model = typeof body.model === 'string' ? body.model : ''
  delete body.model            // NEXUS model id is never a valid HB llm
  if (model) {
    const native = nativeModelId(model)
    if (HB_ALLOWED_LLM.has(native)) body.llm = native
    // else: omit llm entirely -> HB uses its default
  }
  return body
}
```

## Lint
`cd /home/z/my-project && bun run lint` — clean (0 errors, 0 warnings) after
adding `upload/**`, `download/**`, `mini-services/**` to the eslint ignores
(the `upload/` folder holds extracted archives with their own pre-existing
lint issues that are not part of the project source).

## Files changed / created
- `src/lib/os/vfs.ts` (edited) — seed /home/user -> /home/nexus
- `src/components/os/Terminal.tsx` (edited) — cwd + shortCwd + resetVfs
- `src/lib/os/commands.ts` (edited) — cd default + pwd echo + help strings
- `src/lib/os/nexus-commands.ts` (edited) — statusCmd try/catch + sentinelCmd + registry
- `src/app/api/hyperbrowser/agent/route.ts` (created) — HB bridge with llm guard
- `eslint.config.mjs` (edited) — ignore upload/download/mini-services
- `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`,
  `src/app/api/route.ts`, `src/lib/os/*`, `src/lib/nexus/*`,
  `src/components/os/*`, `src/app/api/nexus/*`, `src/app/api/weather/*`,
  `prisma/schema.prisma` (copied from upload/_extracted_shell_v4/ to make the
  project live in the main tree)

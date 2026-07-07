# WAVE-3B — AI Chat + Multi-Provider LLM Backend

**Task ID:** WAVE-3B
**Agent:** full-stack-developer (AI Chat + LLM)
**Scope:** NEXUS AI chat app (`src/apps/ai-chat.tsx`) + the full multi-provider LLM backend (`src/lib/nexus/**`, `src/app/api/ai/**`, `src/lib/os/ai-stream.ts`).

## What I built

### Backend (server-only, all real upstream calls — no stubs)

- **`src/lib/nexus/types.ts`** — `ChatMessage`, `ModelOption` (id/label/provider/description/contextWindow/supportsVision/supportsTools/tier/isFree/available/requiresKey/keyUrl), `CompletionRequest`, `CompletionResponse`, `ProviderEntry`, `ModelTier`.
- **`src/lib/nexus/providers/registry.ts`** — `Provider` interface `{id, label, isAvailable(), unavailableReason(), listModels(), complete(req, entry), stream(req, entry)}`, registry Map, `registerProvider/getProvider/listProviders/listAvailableProviders`, `splitModelId()` (splits on FIRST colon so native ids with colons like `nvidia/nemotron-...:free` survive).
- **`src/lib/nexus/providers/openai-compat.ts`** — `OpenAiCompatProvider` class. `complete()` POSTs `{model:nativeId, messages, temperature, max_tokens, stream:false}` + `Authorization: Bearer`, parses `choices[0].message.content`. `stream()` POSTs with `stream:true` and `parseSseStream()` decodes the ReadableStream (TextDecoder stream:true → buffer → split on `\n\n` → `data:` lines → yield `choices[0].delta.content` → stop on `[DONE]`). 90s AbortController timeout. `headerExtras` hook for OpenRouter. Exports `parseSseStream` (reused by zai).
- **`src/lib/nexus/providers/zai.ts`** — `ZaiProvider` (always available, `isFree`). Lazy-loads `z-ai-web-dev-sdk` via dynamic `import()` cached in a module-level promise (client bundles never pull the SDK). Models: `glm-5.2` (flagship), `glm-5`, `glm-5v-turbo` (vision), `glm-4.6`, `glm-4-flash`. `complete()` uses SDK `create({stream:false})` → parsed JSON; `stream()` uses SDK `create({stream:true})` → ReadableStream → reuses `parseSseStream()`.
- **9 OpenAI-compat provider files** (each constructs `OpenAiCompatProvider` + `registerProvider`):
  - `openai.ts` (6 models), `groq.ts` (5), `cerebras.ts` (3), `openrouter.ts` (5 free, `HTTP-Referer: https://nexus.os` + `X-Title: NEXUS OS`), `mistral.ts` (5), `novita.ts` (5), `nvidia.ts` (5), `qwen.ts` (3), `opencodezen.ts` (4), `kilocode.ts` (4 incl `anthropic/claude-opus-4.8`).
- **`src/lib/nexus/providers/index.ts`** — imports all 11 provider modules (side-effect registration). `listAllModels()` flattened + cached per env-signature (adding a key at runtime re-evaluates availability). `getDefaultModel()` preference: `zai:glm-5.2` → `openai:gpt-5.5` → `groq:openai/gpt-oss-120b` → first available → first period.
- **`src/lib/nexus/llm.ts`** (server-only) — `complete(req)`, `streamComplete(req)` (async generator), `askOnce(prompt, model?)` (default-model fallback). `resolve()` throws clear errors for unknown provider / unavailable / malformed id.
- **`src/lib/nexus/models.ts`** — `getModels()`, `getDefaultModel()`, `getDefaultModelId()`.
- **`src/lib/nexus/judge.ts`** (server-only) — `judgeNarratives(task, narratives[], model?)` builds a judge prompt, calls `askOnce`, defensively parses JSON (raw → ```json fences → first `{...}` block), validates winner is a known id, graceful fallback. Returns `{winner, reasoning, scores, raw}`.

### API routes (all `force-dynamic`, nodejs runtime)

- **`POST /api/ai/chat`** — `{messages, model?, temperature?, systemPrompt?}` → `text/event-stream`: `data: {"delta":"<chunk>"}\n\n` per token, `data: {"error":"<msg>"}\n\n` on error, `data: [DONE]\n\n` at end. ReadableStream with async `start()`. Defaults model to `getDefaultModelId()`.
- **`POST /api/ai/ask`** — `{prompt, model?}` → `{ok, answer, model, latencyMs}`.
- **`GET /api/ai/models`** — `{count, available, default, models}`.

### Client

- **`src/lib/os/ai-stream.ts`** — `streamChat({messages, model, systemPrompt, temperature, signal, onToken, onError})` POSTs `/api/ai/chat` (relative), reads body via `getReader()`+TextDecoder, buffers, splits on `\n\n`, parses `data:` lines. `fetchModels()` → GET `/api/ai/models`. All paths RELATIVE (Caddy-friendly, no ports).
- **`src/apps/ai-chat.tsx`** — ChatGPT-style chat (`'use client'`):
  - **Model picker** = `Popover` + `Command` (cmdk) searchable combobox. Custom substring filter; each item `value` = lowercased composite of `id+label+provider+providerLabel+tier+free/paid+description` so typing `free` / `nvidia` / `glm` / `groq` / `flagship` all filter. Grouped by provider (zai first then alpha). Each row: availability dot + label + FREE badge + tier badge + description + check on current. Unavailable models shown but disabled.
  - **Messages**: user bubbles (cyber-cyan, right, monospace, no markdown), assistant bubbles (phosphor, left, `react-markdown` with code/pre/ul/ol/a/h1-3/blockquote/table overrides all themed via CSS vars). Blinking `█` cursor on the streaming assistant message (custom `@keyframes nexusCursorBlink steps(2)`). Auto-scroll sticks to bottom unless user scrolled up.
  - **Input**: auto-grow textarea (capped 180px), Enter sends / Shift+Enter newline. Send (phosphor) swaps to Stop (cyber-magenta) while streaming. `AbortController` cancels the fetch; `AbortError` swallowed. Empty assistant bubbles dropped on finally.
  - **Persistence**: localStorage key `nexus:ai-chat:v1` = `{messages, model, systemPrompt, temperature}`.
  - **Settings Dialog**: system prompt textarea + temperature Slider (0–2, step 0.05) with live readout.
  - **Empty state**: NEXUS block-letter ASCII logo + subtitle + 4 suggested-prompt buttons (click → sends immediately).
  - **registerApp**: `{ id:'ai-chat' as AppId, name:'NEXUS AI', icon:'⬡', component:AiChatApp, defaultSize:{w:760,h:560}, minSize:{w:380,h:360}, singleton:false, pinned:true, category:'ai', title:'NEXUS AI' }`.

## Counts

- **11 providers** registered (zai + 10 OpenAI-compat).
- **50 models** total: zai:5, openai:6, groq:5, cerebras:3, openrouter:5, mistral:5, novita:5, nvidia:5, qwen:3, opencodezen:4, kilocode:4.
- With all `.env` keys present, all 11 providers report `available=true`.

## Key decisions / notes for downstream agents

1. **AppId cast**: registered with `id: 'ai-chat' as AppId` because the `AppId` union (WAVE-1 `src/lib/os/types.ts`) lists `'nexus-ai'` not `'ai-chat'`. Used a LOCAL cast in `ai-chat.tsx` to avoid modifying the shared `types.ts`. If the orchestrator prefers `'nexus-ai'` as the registration id, change the cast in `ai-chat.tsx` — no other code depends on the literal.
2. **`icon` is a string glyph** (`'⬡'`), not a Lucide component — `AppDef.icon` is typed `string` and `desktop.tsx` renders `{app.icon}` as text inside a span. Did not import `Bot` to avoid an unused-import lint error.
3. **Did NOT touch `src/apps/index.ts`** — the orchestrator must append `import './ai-chat'` to wire the app into the desktop barrel.
4. **z-ai SDK is lazy-loaded** (`await import('z-ai-web-dev-sdk')` inside `getZai()`, cached in a module-level promise). Importing `providers/index.ts` does NOT pull the SDK into the module graph at load time. The API routes are server-only; `ai-chat.tsx` imports only `@/lib/os/ai-stream` (client-safe) + type-only `@/lib/nexus/types` — no server-only code leaks into the client bundle.
5. **SSE streaming is real** — `/api/ai/chat` wraps `streamComplete()` which calls `provider.stream()` (OpenAiCompatProvider fetches with `stream:true` and parses the upstream SSE; zai uses the SDK's ReadableStream). Tokens flow: upstream → `parseSseStream` → `streamComplete` generator → route `data: {"delta":...}` → client `streamChat` `onToken` → React state append. Verified the parser handles chunk boundaries (buffer on `\n\n`) and multi-byte UTF-8 (TextDecoder `stream:true`).
6. **Model picker search** is a custom `filter={(value, search) => value.includes(search.toLowerCase()) ? 1 : 0}` on the `Command`, with each `CommandItem`'s `value` set to a rich lowercased composite string. Typing `free`, `nvidia`, `glm`, `groq`, `flagship`, `code`, etc. all filter across all provider groups.
7. **`splitModelId`** splits on the FIRST colon only — native ids like `nvidia/nemotron-3-ultra-550b-a55b:free` and `meta-llama/llama-4-scout-17b-16e-instruct:free` keep their trailing `:free` in the native id.

## Lint result

- `bun run lint` (global, once): **2 errors + 3 warnings, ALL in parallel-agent files** — `src/apps/browser.tsx`, `src/apps/code-editor.tsx`, `src/components/os/less-viewer.tsx`, `src/components/os/code-editor/worker.ts`. NONE in any WAVE-3B file.
- Targeted `eslint src/lib/nexus src/app/api/ai src/lib/os/ai-stream.ts src/apps/ai-chat.tsx` → **zero output (clean)**.
- I did NOT modify the parallel-agent files (out of scope; would risk merge conflicts).

## Dev log

- `tail dev.log` shows ongoing `✓ Compiled` + `GET / 200` with no errors introduced by my files. `ai-chat.tsx` is not yet on the desktop (orchestrator must wire the barrel import).

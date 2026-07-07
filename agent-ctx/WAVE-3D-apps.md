# WAVE-3D — Apps: Code Editor + File Manager + Notepad

Agent: full-stack-developer (WAVE-3D)
Task ID: WAVE-3D
Scope: Build 3 apps (code-editor, file-manager, notepad), launch-params
helper, and a JS Web Worker interpreter. Register each via `registerApp`.

## Files Created / Modified

### Modified
- `src/lib/os/types.ts` — `AppDef.icon` is now `React.ReactNode`
  (lucide elements + emoji strings both work). `AppDef.defaultSize`
  and `AppDef.minSize` accept optional `x,y`. Added `'file-manager'`
  to the `AppId` union (kept `'files'` for future use).
- `src/stores/window-store.ts` — added `'file-manager'` to
  `DEFAULT_SIZES` (Record<AppId,...> is exhaustive).
- `src/apps/registry.tsx` — `openApp` now returns `string | undefined`
  (the windowId of the opened/focused window). Also passes `x,y` from
  `AppDef.defaultSize` into `ws.openWindow`. Backward-compatible.

### New
- `src/lib/os/launch-params.ts` — per-window launch-params store.
  API: `setLaunchParams`, `getLaunchParams`, `takeLaunchParams`
  (one-shot), `clearLaunchParams`, `useLaunchParams(windowId)` React
  hook (useSyncExternalStore + per-windowId snapshot cache).
- `src/components/os/code-editor/worker.ts` — Web Worker JS
  interpreter. `new Function('"use strict";\n' + code)` wrapped in
  try/catch. Console shim (log/info/warn/error) → posts
  `{type:'output',line,level}`. Runtime errors → `{type:'error',
  message}`. Always ends with `{type:'done'}`. Robust stringify
  (circular refs, Error, Array, functions, symbols, bigint).
- `src/apps/code-editor.tsx` — full code editor.
- `src/apps/file-manager.tsx` — GUI file manager.
- `src/apps/notepad.tsx` — simple text editor.

## Architecture Decisions

### AppDef type extension
The WAVE-3D brief specifies `icon: Code2` (a lucide-react element)
and `defaultSize: {x,y,w,h}`. The existing `AppDef` had
`icon: string` and `defaultSize: {w,h}`. I extended the type rather
than deviate from the brief:
- `icon: React.ReactNode` — backward-compatible (strings are
  ReactNode).
- `defaultSize.x?` and `.y?` optional — registry.openApp passes them
  to `ws.openWindow` when defined; falls back to cascade positioning
  when absent (existing behavior).

### openApp return value
`openApp(id)` now returns the windowId. This is essential for the
launch-params flow: file-manager calls `openApp('code-editor')` →
gets `winId` → `setLaunchParams(winId, { filePath })`. The code
editor (singleton) reads its launch-params via `useLaunchParams(
windowId)` and auto-loads the file.

### Worker URL pattern
Used `new Worker(new URL('../components/os/code-editor/worker.ts',
import.meta.url))` from `src/apps/code-editor.tsx`. Webpack 5
resolves the relative path against `import.meta.url` and emits the
worker as a separate chunk.

### Launch-params consumption pattern
Both code-editor and notepad use:
```ts
const params = useLaunchParams(windowId)
useEffect(() => {
  const fp = params.filePath
  if (typeof fp !== 'string' || !fp) return
  // (confirm discard if dirty + fp !== current filePath)
  loadFile(fp)
  clearLaunchParams(windowId)  // so re-opening same path re-triggers
}, [params.filePath, loadFile, windowId, filePath])
```

This handles all race conditions:
- If the window was already open (singleton), `useLaunchParams`
  notifies on `setLaunchParams` → effect fires.
- If the window was just created, `useLaunchParams` returns the
  set value on first render → effect fires on mount.
- Clearing after consuming means re-opening the same path later
  still triggers a load.

## Code Editor — Performance Verification

Confirmed `React.memo` optimizations:
- `TreeNode = memo(function TreeNode({...}))` — receives stable
  props (FSNode reference, path string, depth number, booleans,
  useCallback'd handlers). Bails out on parent re-render unless
  props actually change.
- `Gutter = memo(function Gutter({lineCount, gutterRef}))` — only
  re-renders when `lineCount` changes. `gutterRef` is a stable ref
  object. **Typing within a line does NOT change `lineCount` →
  gutter does not re-render.**
- `ConsoleRow = memo(function ConsoleRow({line}))` — each row keeps
  its object reference across parent re-renders (unchanged rows
  preserve their slot in the array).
- All handlers are `useCallback`'d: `handleSelect`, `handleToggle`,
  `handleDelete`, `handleNew`, `handleSave`, `handleClear`,
  `handleContentChange`, `handleScroll`, `handleKeyDown`,
  `handleRun`, `pushLine`.
- `lineCount` derived via `useMemo([content])`.
- Gutter ↔ textarea scroll sync is via direct ref manipulation
  (`gutterRef.current.scrollTop = taRef.current.scrollTop`), NOT
  via React state — bypasses React entirely on scroll.

Net effect of typing in the textarea:
1. `content` state updates in `CodeEditorApp`.
2. `CodeEditorApp` re-renders.
3. `TopBar` JSX re-evaluates (cheap).
4. `FileTree` JSX re-evaluates → root `TreeNode` element created.
5. `TreeNode`'s `React.memo` compares props → all stable → bails.
6. `Gutter` element created → `React.memo` compares props →
   `lineCount` unchanged → bails.
7. `textarea` re-renders (controlled by `content`).
8. `Console` JSX re-evaluates → each `ConsoleRow` bails via memo.

So typing only causes the textarea + parent to actually re-render.
The memo'd children skip their render functions entirely.

## .py File Handling

- `.py` files are openable in the code editor (just text).
- Language auto-detects as `'python'` on load.
- Editing works normally (textarea).
- Clicking **Run** with language='python' shows the stub message
  in the console: `"Python execution requires Pyodide (not loaded)"`
  + `"Save the file and run it in an external Python interpreter."`
  — no worker is spawned.

## File-Manager → Code-Editor / Notepad Flow

When a file is double-clicked in file-manager:
```ts
const openEntry = useCallback((node: FSNode) => {
  const nodePath = `${cwd === '/' ? '' : cwd}/${node.name}`
  if (node.type === 'dir') {
    navigate(nodePath)
    return
  }
  const appId = openerFor(node.name)  // 'code-editor' or 'notepad'
  const winId = openApp(appId)
  if (!winId) { toast.error(...); return }
  setLaunchParams(winId, { filePath: nodePath })
}, [cwd, navigate])
```

`openerFor(name)`:
- `.js`, `.ts`, `.tsx`, `.py`, `.json` → `'code-editor'`
- everything else (incl. `.txt`, `.md`, no-extension) → `'notepad'`

`openApp` returns the windowId (singleton code-editor focuses
existing; non-singleton notepad creates a new window).
`setLaunchParams(winId, { filePath })` then notifies the consumer
app's `useLaunchParams` hook, which loads the file via `loadFile`.

## Lint Result

`bun run lint` — see worklog.

## Handoff to Subsequent Waves

- The barrel `src/apps/index.ts` was NOT touched per instruction.
  WAVE-3D apps self-register on import — but `index.ts` only imports
  `'./registry'`, so my apps are not yet loaded at boot.
  → Next wave (or final integrator) must add
  `import './code-editor'`, `import './file-manager'`,
  `import './notepad'` to `src/apps/index.ts`.
- `AppDef.icon` is now `React.ReactNode`. Future waves can pass
  lucide elements OR emoji strings.
- `AppDef.defaultSize` accepts optional `x,y`. Future waves can
  pass position; omit for cascade.
- `openApp(id)` returns `string | undefined` — future waves can use
  it to pair windows with launch-params (e.g. terminal opening a
  file in code-editor).
- `'file-manager'` is in the `AppId` union + `DEFAULT_SIZES`. The
  older `'files'` id is preserved for any wave that uses it.

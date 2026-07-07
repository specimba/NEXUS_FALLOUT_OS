// ============================================================
// NEXUS OS — Code Editor Worker
//
// Web Worker JS interpreter. Receives { code: string } from the main
// thread, executes the code via `new Function('"use strict";' + code)`
// wrapped in try/catch, captures console.log/info/warn/error, and
// posts back { type:"output"|"error"|"done", ... } messages.
//
// Loaded from src/apps/code-editor.tsx via:
//   new Worker(new URL('./worker.ts', import.meta.url))
// ============================================================

/// <reference lib="webworker" />

type ConsoleLevel = 'log' | 'info' | 'warn' | 'error'

type OutgoingMessage =
  | { type: 'output'; line: string; level: ConsoleLevel }
  | { type: 'error'; message: string }
  | { type: 'done' }

interface IncomingMessage {
  code: string
}

function post(msg: OutgoingMessage): void {
  ;(self as unknown as Worker).postMessage(msg)
}

/**
 * Stringify a value the way console.log would (best-effort, no deps).
 */
function stringify(v: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  const t = typeof v
  if (t === 'string') return v
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v)
  if (t === 'symbol') {
    const s = v as symbol
    return `[Symbol: ${s.description ?? ''}]`
  }
  if (t === 'function') {
    const fn = v as { name?: string }
    return `[Function: ${fn.name || 'anonymous'}]`
  }
  if (t === 'object') {
    const o = v as object
    if (seen.has(o)) return '[Circular]'
    seen.add(o)
    try {
      if (o instanceof Error) {
        const err = o as Error
        return `${err.name}: ${err.message}`
      }
      if (Array.isArray(o)) {
        return `[${o.map((x) => stringify(x, seen)).join(', ')}]`
      }
      return JSON.stringify(o, (_k, val) => {
        if (typeof val === 'function') return '[Function]'
        if (typeof val === 'symbol') return `[Symbol: ${String(val)}]`
        if (typeof val === 'bigint') return `${val.toString()}n`
        return val
      })
    } catch {
      return '[Unserializable]'
    }
  }
  return String(v)
}

function formatArgs(args: unknown[]): string {
  return args.map((a) => stringify(a)).join(' ')
}

function shimConsole(): () => void {
  const ctx = self as unknown as { console?: Record<string, unknown> }
  const orig = ctx.console
  const fake = {
    log: (...a: unknown[]) => post({ type: 'output', line: formatArgs(a), level: 'log' }),
    info: (...a: unknown[]) => post({ type: 'output', line: formatArgs(a), level: 'info' }),
    warn: (...a: unknown[]) => post({ type: 'output', line: formatArgs(a), level: 'warn' }),
    error: (...a: unknown[]) => post({ type: 'output', line: formatArgs(a), level: 'error' }),
    debug: (...a: unknown[]) => post({ type: 'output', line: formatArgs(a), level: 'log' }),
    trace: (...a: unknown[]) => post({ type: 'output', line: formatArgs(a), level: 'log' }),
  }
  ctx.console = fake
  return () => {
    ctx.console = orig
  }
}

self.onmessage = (e: MessageEvent<IncomingMessage>) => {
  const { code } = e.data ?? {}
  if (typeof code !== 'string') {
    post({ type: 'error', message: 'no code provided' })
    post({ type: 'done' })
    return
  }
  const restore = shimConsole()
  try {
    const fn = new Function('"use strict";\n' + code) as (...a: unknown[]) => unknown
    const result = fn()
    if (result !== undefined) {
      post({ type: 'output', line: stringify(result), level: 'log' })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : stringify(err)
    post({ type: 'error', message: msg })
  } finally {
    restore()
    post({ type: 'done' })
  }
}

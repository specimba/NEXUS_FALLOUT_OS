'use client'

// ============================================================
// NEXUS OS — Browser app
//
// Multi-engine browser: BL (Browserless) ↔ HB (Hyperbrowser).
// Modes: SMART / SCRAPE / SCREENSHOT / PDF / SEARCH / RAW.
//
// SMART (BL):  /api/browserless {content} → HTML → blob-URL iframe
//              (sandboxed; <base href> injected for relative links).
// SMART (HB):  /api/hyperbrowser/scrape → markdown → react-markdown.
// SCRAPE:      CSS selector input → BL scrape OR HB scrape.
// SCREENSHOT:  BL screenshot → PNG blob → <img>. HB → markdown fallback.
// PDF:         BL /pdf → blob → iframe.
// SEARCH:      auto-switched when the input isn't a URL.
// RAW:         MCP fetch (probes /api/mcp/tools; skips if absent).
//
// Address bar: Back / Forward / Reload / Home + input + Go.
// Engine toggle persisted to localStorage('nexus:browser:engine').
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Search as SearchIcon,
  Camera,
  FileText,
  Code2,
  Sparkles,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { registerApp } from '@/apps/registry'
import type { WindowComponentProps } from '@/lib/os/types'
import {
  fetchContent,
  scrape as blScrape,
  screenshot as blScreenshot,
  fetchPdf,
  search as blSearch,
  type BLSearchResult,
} from '@/lib/os/browserless-client'
import {
  hbScrape,
  hbSearch,
  type HBSearchResult,
} from '@/lib/os/hyperbrowser-client'

// ----- types --------------------------------------------------------

type Engine = 'BL' | 'HB'
type Mode = 'SMART' | 'SCRAPE' | 'SCREENSHOT' | 'PDF' | 'SEARCH' | 'RAW'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; startedAt: number }
  | { kind: 'done'; ms: number }
  | { kind: 'error'; message: string; ms?: number }

type LoadResult =
  | { kind: 'iframe'; blobUrl: string; html?: string }
  | { kind: 'markdown'; markdown: string }
  | { kind: 'screenshot'; src: string }
  | { kind: 'pdf'; blobUrl: string }
  | { kind: 'search'; results: Array<{ title?: string; url?: string; snippet?: string }> }
  | { kind: 'scrape'; results: Array<Record<string, unknown>>; selector: string }
  | { kind: 'raw'; content: string; contentType: string }
  | { kind: 'fallback'; url: string; reason: string; html?: string }

const HOME_URL = 'about:home'
const ENGINE_KEY = 'nexus:browser:engine'

function isUrlLike(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (/^https?:\/\//i.test(t)) return true
  // bare domain like example.com/path
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(t)) return true
  if (/^localhost(:\d+)?(\/.*)?$/i.test(t)) return true
  return false
}

function normalizeUrl(s: string): string {
  const t = s.trim()
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

function injectBaseHref(html: string, url: string): string {
  if (!html) return html
  // Inject a <base> tag so relative resource URLs resolve against the
  // origin of the source page (works for many static HTML pages).
  const baseTag = `<base href="${escapeAttr(url)}">`
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`)
  }
  return `${baseTag}${html}`
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function loadEnginePref(): Engine {
  if (typeof window === 'undefined') return 'BL'
  try {
    const v = window.localStorage.getItem(ENGINE_KEY)
    return v === 'HB' ? 'HB' : 'BL'
  } catch {
    return 'BL'
  }
}

function saveEnginePref(e: Engine) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ENGINE_KEY, e)
  } catch {
    /* ignore */
  }
}

// ----- component ----------------------------------------------------

function BrowserApp(_props: WindowComponentProps) {
  const [engine, setEngine] = useState<Engine>('BL')
  const [mode, setMode] = useState<Mode>('SMART')
  const [urlInput, setUrlInput] = useState('')
  const [currentUrl, setCurrentUrl] = useState<string>('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [result, setResult] = useState<LoadResult | null>(null)
  const [scrapeSelector, setScrapeSelector] = useState('body')
  const [rawContent, setRawContent] = useState('')
  const [mcpAvailable, setMcpAvailable] = useState<boolean | null>(null)

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const lastBlobUrls = useRef<string[]>([])

  // ---- init: load engine preference + probe MCP -------------------
  useEffect(() => {
    setEngine(loadEnginePref())
    // Probe /api/mcp/tools (RAW mode is optional).
    fetch('/api/mcp/tools', { method: 'GET' })
      .then((r) => setMcpAvailable(r.ok))
      .catch(() => setMcpAvailable(false))
  }, [])

  // ---- cleanup blob URLs on unmount/replace -----------------------
  const trackBlob = useCallback((u: string) => {
    lastBlobUrls.current.push(u)
  }, [])

  useEffect(() => {
    return () => {
      for (const u of lastBlobUrls.current) {
        try {
          URL.revokeObjectURL(u)
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  // ---- history helpers --------------------------------------------
  const canBack = historyIndex > 0
  const canForward = historyIndex < history.length - 1

  const pushHistory = useCallback(
    (url: string) => {
      setHistory((h) => {
        const truncated = h.slice(0, historyIndex + 1)
        const next = [...truncated, url]
        // cap history at 50 entries
        const capped = next.length > 50 ? next.slice(next.length - 50) : next
        return capped
      })
      setHistoryIndex((i) => Math.min(i + 1, 49))
    },
    [historyIndex]
  )

  const goBack = useCallback(() => {
    if (!canBack) return
    const newIdx = historyIndex - 1
    setHistoryIndex(newIdx)
    const u = history[newIdx]
    if (u && u !== HOME_URL) {
      setUrlInput(u)
      void loadUrl(u, { skipHistory: true })
    } else {
      // home
      setUrlInput('')
      setCurrentUrl(HOME_URL)
      setResult(null)
      setStatus({ kind: 'idle' })
    }
  }, [canBack, historyIndex, history])

  const goForward = useCallback(() => {
    if (!canForward) return
    const newIdx = historyIndex + 1
    setHistoryIndex(newIdx)
    const u = history[newIdx]
    if (u && u !== HOME_URL) {
      setUrlInput(u)
      void loadUrl(u, { skipHistory: true })
    } else {
      setUrlInput('')
      setCurrentUrl(HOME_URL)
      setResult(null)
      setStatus({ kind: 'idle' })
    }
  }, [canForward, historyIndex, history])

  const goHome = useCallback(() => {
    setUrlInput('')
    setCurrentUrl(HOME_URL)
    setResult(null)
    setStatus({ kind: 'idle' })
    pushHistory(HOME_URL)
  }, [pushHistory])

  const reload = useCallback(() => {
    if (currentUrl && currentUrl !== HOME_URL) {
      void loadUrl(currentUrl, { skipHistory: true })
    }
  }, [currentUrl])

  // ---- main load function -----------------------------------------
  const loadUrl = useCallback(
    async (
      raw: string,
      opts: { skipHistory?: boolean; forceMode?: Mode } = {}
    ) => {
      const input = raw.trim()
      if (!input) return

      // Decide if this is a search or a URL.
      const looksLikeUrl = isUrlLike(input)
      const effectiveMode: Mode =
        opts.forceMode ?? (looksLikeUrl ? mode : 'SEARCH')

      // Non-URL input is always a search query (regardless of mode).
      if (!looksLikeUrl) {
        return loadSearch(input, { skipHistory: opts.skipHistory })
      }

      const url = normalizeUrl(input)
      setUrlInput(input)
      setCurrentUrl(url)
      const startedAt = Date.now()
      setStatus({ kind: 'loading', startedAt })
      setResult(null)
      if (!opts.skipHistory) pushHistory(url)

      try {
        const r = await dispatchLoad(engine, effectiveMode, url, scrapeSelector)
        setResult(r)
        if (r.kind === 'iframe' || r.kind === 'pdf') trackBlob(r.blobUrl)
        if (r.kind === 'screenshot') trackBlob(r.src)
        if (r.kind === 'raw') setRawContent(r.content)
        setStatus({ kind: 'done', ms: Date.now() - startedAt })
      } catch (e) {
        setStatus({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        })
      }
    },
    [engine, mode, scrapeSelector, pushHistory, trackBlob]
  )

  const loadSearch = useCallback(
    async (query: string, opts: { skipHistory?: boolean } = {}) => {
      setUrlInput(query)
      setCurrentUrl(`search:${query}`)
      setStatus({ kind: 'loading', startedAt: Date.now() })
      setResult(null)
      setMode('SEARCH')
      if (!opts.skipHistory) pushHistory(`search:${query}`)

      try {
        const startedAt = Date.now()
        let results: LoadResult
        if (engine === 'BL') {
          const r: BLSearchResult = await blSearch(query)
          if (!r.ok) throw new Error(r.error || 'BL search failed')
          results = {
            kind: 'search',
            results: (r.results ?? []).map((x) => ({
              title: typeof x?.title === 'string' ? x.title : undefined,
              url:
                typeof x?.url === 'string'
                  ? x.url
                  : typeof x?.link === 'string'
                    ? x.link
                    : undefined,
              snippet:
                typeof x?.snippet === 'string'
                  ? x.snippet
                  : typeof x?.description === 'string'
                    ? x.description
                    : undefined,
            })),
          }
        } else {
          const r: HBSearchResult = await hbSearch(query)
          if (!r.ok) throw new Error(r.error || 'HB search failed')
          results = {
            kind: 'search',
            results: (r.results ?? []).map((x) => ({
              title: typeof x?.title === 'string' ? x.title : undefined,
              url:
                typeof x?.url === 'string'
                  ? x.url
                  : typeof x?.link === 'string'
                    ? x.link
                    : undefined,
              snippet:
                typeof x?.snippet === 'string'
                  ? x.snippet
                  : typeof x?.description === 'string'
                    ? x.description
                    : undefined,
            })),
          }
        }
        setResult(results)
        setStatus({ kind: 'done', ms: Date.now() - startedAt })
      } catch (e) {
        setStatus({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        })
      }
    },
    [engine, pushHistory]
  )

  // ---- go button: parses address bar ------------------------------
  const onGo = useCallback(() => {
    const input = urlInput.trim()
    if (!input) return
    if (input === HOME_URL) {
      goHome()
      return
    }
    if (input.startsWith('search:')) {
      void loadSearch(input.slice('search:'.length), { skipHistory: true })
      return
    }
    void loadUrl(input)
  }, [urlInput, loadUrl, loadSearch, goHome])

  // ---- engine toggle ----------------------------------------------
  const switchEngine = useCallback(
    (e: Engine) => {
      setEngine(e)
      saveEnginePref(e)
      // if a URL is currently loaded, reload with the new engine
      if (currentUrl && currentUrl !== HOME_URL && !currentUrl.startsWith('search:')) {
        void loadUrl(currentUrl, { skipHistory: true })
      }
    },
    [currentUrl]
  )

  // ---- mode change ------------------------------------------------
  const switchMode = useCallback(
    (m: Mode) => {
      setMode(m)
      // SEARCH mode doesn't reload — the user will type a query next.
      if (m === 'SEARCH') return
      if (
        currentUrl &&
        currentUrl !== HOME_URL &&
        !currentUrl.startsWith('search:')
      ) {
        void loadUrl(currentUrl, { skipHistory: true, forceMode: m })
      }
    },
    [currentUrl]
  )

  // ---- screenshot fallback for the current URL -------------------
  const takeScreenshot = useCallback(async () => {
    if (!currentUrl || currentUrl === HOME_URL) return
    setStatus({ kind: 'loading', startedAt: Date.now() })
    try {
      const startedAt = Date.now()
      const r = await blScreenshot(currentUrl)
      if (!r.ok || !r.blobUrl) throw new Error(r.error || 'screenshot failed')
      trackBlob(r.blobUrl)
      setResult({ kind: 'screenshot', src: r.blobUrl })
      setStatus({ kind: 'done', ms: Date.now() - startedAt })
    } catch (e) {
      setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }, [currentUrl, trackBlob])

  // ---- view raw HTML ---------------------------------------------
  const viewHtml = useCallback(async () => {
    if (!currentUrl || currentUrl === HOME_URL) return
    setStatus({ kind: 'loading', startedAt: Date.now() })
    try {
      const startedAt = Date.now()
      const r = await fetchContent(currentUrl)
      if (!r.ok) throw new Error(r.error || 'content fetch failed')
      setRawContent(r.html || '')
      setResult({
        kind: 'raw',
        content: r.html || '',
        contentType: 'text/html',
      })
      setStatus({ kind: 'done', ms: Date.now() - startedAt })
    } catch (e) {
      setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }, [currentUrl])

  // ---- open in new tab -------------------------------------------
  const openInNewTab = useCallback(() => {
    if (!currentUrl || currentUrl === HOME_URL) return
    try {
      window.open(currentUrl, '_blank', 'noopener,noreferrer')
    } catch {
      /* ignore */
    }
  }, [currentUrl])

  // ---- render content area ---------------------------------------
  const contentEl = useMemo(() => {
    if (status.kind === 'loading') {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex flex-col items-center gap-2 opacity-80">
            <Loader2
              className="h-6 w-6 animate-spin"
              style={{ color: 'var(--phosphor-bright)' }}
            />
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--phosphor-dim)' }}
            >
              loading…
            </span>
          </div>
        </div>
      )
    }

    if (status.kind === 'error') {
      return (
        <FallbackPanel
          url={currentUrl}
          reason={status.message}
          onScreenshot={takeScreenshot}
          onRaw={viewHtml}
          onNewTab={openInNewTab}
          rawContent={rawContent}
        />
      )
    }

    if (!result) {
      return <HomeScreen onPick={(u) => setUrlInput(u)} />
    }

    switch (result.kind) {
      case 'iframe':
        return (
          <iframe
            ref={iframeRef}
            src={result.blobUrl}
            title="Browser content"
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
            className="h-full w-full border-0 bg-white"
          />
        )

      case 'pdf':
        return (
          <iframe
            src={result.blobUrl}
            title="PDF content"
            className="h-full w-full border-0 bg-white"
          />
        )

      case 'screenshot':
        return (
          <div className="h-full w-full overflow-auto bg-white">
            <img
              src={result.src}
              alt={`Screenshot of ${currentUrl}`}
              className="block h-auto w-full"
            />
          </div>
        )

      case 'markdown':
        return (
          <div
            className="h-full w-full overflow-auto px-4 py-3"
            style={{
              background: 'var(--card)',
              color: 'var(--phosphor-bright)',
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
            }}
          >
            <article
              className="mx-auto max-w-3xl text-[13px] leading-relaxed"
              style={{ color: 'var(--phosphor)' }}
            >
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1
                      className="mb-2 mt-4 text-base font-semibold"
                      style={{ color: 'var(--phosphor-bright)' }}
                    >
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2
                      className="mb-2 mt-3 text-sm font-semibold"
                      style={{ color: 'var(--phosphor-bright)' }}
                    >
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3
                      className="mb-1 mt-3 text-[13px] font-semibold"
                      style={{ color: 'var(--phosphor-bright)' }}
                    >
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="mb-2" style={{ color: 'var(--phosphor)' }}>
                      {children}
                    </p>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      style={{ color: 'var(--cyber-cyan)' }}
                    >
                      {children}
                    </a>
                  ),
                  code: ({ children }) => (
                    <code
                      className="rounded px-1 py-0.5 text-[12px]"
                      style={{
                        background: 'var(--bg-deep)',
                        color: 'var(--pip-amber)',
                        fontFamily: 'var(--font-mono), ui-monospace, monospace',
                      }}
                    >
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre
                      className="my-2 overflow-x-auto rounded p-2 text-[12px]"
                      style={{
                        background: 'var(--bg-deep)',
                        color: 'var(--pip-amber)',
                        fontFamily: 'var(--font-mono), ui-monospace, monospace',
                      }}
                    >
                      {children}
                    </pre>
                  ),
                  ul: ({ children }) => (
                    <ul
                      className="mb-2 ml-5 list-disc"
                      style={{ color: 'var(--phosphor)' }}
                    >
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol
                      className="mb-2 ml-5 list-decimal"
                      style={{ color: 'var(--phosphor)' }}
                    >
                      {children}
                    </ol>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote
                      className="my-2 border-l-2 pl-2 italic"
                      style={{
                        borderColor: 'var(--phosphor-dim)',
                        color: 'var(--phosphor-dim)',
                      }}
                    >
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {result.markdown}
              </ReactMarkdown>
            </article>
          </div>
        )

      case 'search':
        return (
          <div
            className="h-full w-full overflow-auto px-3 py-2"
            style={{ background: 'var(--card)', color: 'var(--phosphor)' }}
          >
            <div
              className="mb-2 text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--phosphor-dim)' }}
            >
              {result.results.length} results · {engine}
            </div>
            <ul className="flex flex-col gap-2">
              {result.results.map((r, i) => (
                <li
                  key={i}
                  className="border p-2"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (r.url) {
                        setUrlInput(r.url)
                        void loadUrl(r.url, { forceMode: 'SMART' })
                      }
                    }}
                    className="block w-full text-left"
                  >
                    <div
                      className="text-[13px] font-semibold"
                      style={{ color: 'var(--phosphor-bright)' }}
                    >
                      {r.title || '(untitled)'}
                    </div>
                    {r.url && (
                      <div
                        className="truncate text-[10px]"
                        style={{ color: 'var(--cyber-cyan)' }}
                      >
                        {r.url}
                      </div>
                    )}
                    {r.snippet && (
                      <div
                        className="mt-1 text-[11px]"
                        style={{ color: 'var(--phosphor)' }}
                      >
                        {r.snippet}
                      </div>
                    )}
                  </button>
                </li>
              ))}
              {result.results.length === 0 && (
                <li
                  className="p-2 text-[11px] opacity-70"
                  style={{ color: 'var(--phosphor-dim)' }}
                >
                  No results.
                </li>
              )}
            </ul>
          </div>
        )

      case 'scrape':
        return (
          <div
            className="h-full w-full overflow-auto p-3"
            style={{ background: 'var(--card)', color: 'var(--phosphor)' }}
          >
            <div
              className="mb-2 text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--phosphor-dim)' }}
            >
              scrape · {result.selector} · {result.results.length} hits
            </div>
            <pre
              className="overflow-auto p-2 text-[11px]"
              style={{
                background: 'var(--bg-deep)',
                color: 'var(--pip-amber)',
                fontFamily: 'var(--font-mono), ui-monospace, monospace',
              }}
            >
              {JSON.stringify(result.results, null, 2).slice(0, 20000)}
            </pre>
          </div>
        )

      case 'raw':
        return (
          <div className="h-full w-full overflow-auto">
            <pre
              className="p-2 text-[11px]"
              style={{
                background: 'var(--bg-deep)',
                color: 'var(--pip-amber)',
                fontFamily: 'var(--font-mono), ui-monospace, monospace',
              }}
            >
              {result.content.slice(0, 50000)}
            </pre>
          </div>
        )

      case 'fallback':
        return (
          <FallbackPanel
            url={result.url}
            reason={result.reason}
            onScreenshot={takeScreenshot}
            onRaw={viewHtml}
            onNewTab={openInNewTab}
            rawContent={rawContent}
          />
        )

      default:
        return null
    }
  }, [
    status,
    result,
    currentUrl,
    engine,
    takeScreenshot,
    viewHtml,
    openInNewTab,
    rawContent,
    loadUrl,
  ])

  // ---- status bar text -------------------------------------------
  const statusText = useMemo(() => {
    const parts: string[] = []
    parts.push(engine)
    parts.push(mode)
    if (currentUrl) parts.push(currentUrl)
    if (status.kind === 'done') parts.push(`${status.ms}ms`)
    if (status.kind === 'error') parts.push('ERROR')
    return parts.join(' · ')
  }, [engine, mode, currentUrl, status])

  // ---- SCRAPE mode toolbar (extra input) -------------------------
  const showScrapeToolbar = mode === 'SCRAPE'

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ background: 'var(--bg-deep)', color: 'var(--phosphor)' }}
    >
      {/* Toolbar: nav + address bar + engine + mode */}
      <div
        className="flex shrink-0 flex-col gap-1 border-b p-1.5"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-deep)' }}
      >
        <div className="flex items-center gap-1">
          <ToolbarButton
            label="Back"
            disabled={!canBack}
            onClick={goBack}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Forward"
            disabled={!canForward}
            onClick={goForward}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Reload" onClick={reload}>
            <RotateCw className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Home" onClick={goHome}>
            <Home className="h-3.5 w-3.5" />
          </ToolbarButton>

          {/* Address bar — CRITICAL: stopPropagation on keydown so any
              window-level listener (e.g. the Terminal's) doesn't
              swallow typing into this input. */}
          <div
            className="mx-1 flex flex-1 items-center border px-2"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
            }}
          >
            <Globe
              className="mr-1.5 h-3 w-3 shrink-0"
              style={{ color: 'var(--phosphor-dim)' }}
            />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onGo()
                }
              }}
              onKeyUp={(e) => e.stopPropagation()}
              onKeyPress={(e) => e.stopPropagation()}
              placeholder="Enter URL or search…"
              spellCheck={false}
              autoComplete="off"
              className="w-full bg-transparent py-1 text-[12px] outline-none"
              style={{
                color: 'var(--phosphor-bright)',
                fontFamily: 'var(--font-mono), ui-monospace, monospace',
              }}
              aria-label="Address bar"
            />
          </div>

          <ToolbarButton label="Go" onClick={onGo} primary>
            <span className="px-1 text-[10px] uppercase tracking-widest">
              Go
            </span>
          </ToolbarButton>

          {/* Engine toggle */}
          <div
            className="ml-1 flex border"
            style={{ borderColor: 'var(--border)' }}
            role="group"
            aria-label="Engine selector"
          >
            {(['BL', 'HB'] as Engine[]).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => switchEngine(e)}
                className="px-2 py-1 text-[10px] uppercase tracking-widest transition"
                style={{
                  background:
                    engine === e ? 'var(--phosphor-dim)' : 'transparent',
                  color:
                    engine === e
                      ? 'var(--bg-deep)'
                      : 'var(--phosphor-dim)',
                  fontWeight: engine === e ? 700 : 400,
                }}
                aria-pressed={engine === e}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Mode selector + scrape input */}
        <div className="flex items-center gap-1">
          <div
            className="flex flex-wrap items-center border"
            style={{ borderColor: 'var(--border)' }}
            role="group"
            aria-label="Mode selector"
          >
            {(
              [
                { id: 'SMART', icon: Sparkles, label: 'Smart' },
                { id: 'SCRAPE', icon: Code2, label: 'Scrape' },
                { id: 'SCREENSHOT', icon: Camera, label: 'Shot' },
                { id: 'PDF', icon: FileText, label: 'PDF' },
                { id: 'SEARCH', icon: SearchIcon, label: 'Search' },
                { id: 'RAW', icon: Code2, label: 'Raw' },
              ] as { id: Mode; icon: typeof Sparkles; label: string }[]
            ).map((m) => {
              const Icon = m.icon
              const active = mode === m.id
              const disabled =
                m.id === 'RAW' && mcpAvailable === false
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => switchMode(m.id)}
                  disabled={disabled}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-widest transition disabled:opacity-30"
                  style={{
                    background: active ? 'var(--phosphor-dim)' : 'transparent',
                    color: active ? 'var(--bg-deep)' : 'var(--phosphor-dim)',
                    fontWeight: active ? 700 : 400,
                  }}
                  aria-pressed={active}
                  title={
                    m.id === 'RAW' && mcpAvailable === false
                      ? 'MCP bridge unavailable — RAW mode disabled'
                      : `${m.label} mode`
                  }
                >
                  <Icon className="h-3 w-3" />
                  {m.label}
                </button>
              )
            })}
          </div>

          {showScrapeToolbar && (
            <div
              className="ml-1 flex flex-1 items-center border px-2"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              <span
                className="mr-1.5 text-[10px] uppercase tracking-widest"
                style={{ color: 'var(--phosphor-dim)' }}
              >
                CSS
              </span>
              <input
                type="text"
                value={scrapeSelector}
                onChange={(e) => setScrapeSelector(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (currentUrl && currentUrl !== HOME_URL)
                      void loadUrl(currentUrl, {
                        skipHistory: true,
                        forceMode: 'SCRAPE',
                      })
                  }
                }}
                onKeyUp={(e) => e.stopPropagation()}
                onKeyPress={(e) => e.stopPropagation()}
                placeholder="e.g. h1, .article, #content"
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-transparent py-1 text-[11px] outline-none"
                style={{
                  color: 'var(--phosphor-bright)',
                  fontFamily: 'var(--font-mono), ui-monospace, monospace',
                }}
                aria-label="CSS selector"
              />
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="relative flex-1 overflow-hidden">{contentEl}</div>

      {/* Status bar */}
      <div
        className="flex shrink-0 items-center gap-2 border-t px-2 py-0.5"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--bg-deep)',
          color: 'var(--phosphor-dim)',
        }}
      >
        <span
          className="truncate text-[10px] uppercase tracking-widest"
          style={{
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
          }}
        >
          {statusText}
        </span>
      </div>
    </div>
  )
}

// ----- helpers / sub-components ------------------------------------

function ToolbarButton({
  label,
  onClick,
  disabled,
  primary,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 items-center justify-center border px-2 transition disabled:opacity-30"
      style={{
        borderColor: primary ? 'var(--phosphor-dim)' : 'var(--border)',
        background: primary ? 'var(--phosphor-dim)' : 'transparent',
        color: primary ? 'var(--bg-deep)' : 'var(--phosphor)',
      }}
    >
      {children}
    </button>
  )
}

function HomeScreen({ onPick }: { onPick: (url: string) => void }) {
  const suggestions = [
    'https://example.com',
    'https://news.ycombinator.com',
    'https://en.wikipedia.org/wiki/Cyberpunk',
  ]
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-4 p-6"
      style={{ background: 'var(--card)', color: 'var(--phosphor)' }}
    >
      <Globe
        className="h-12 w-12"
        style={{ color: 'var(--phosphor)', textShadow: '0 0 12px var(--phosphor-glow)' }}
      />
      <div
        className="text-sm uppercase tracking-[0.4em]"
        style={{
          color: 'var(--phosphor-bright)',
          fontFamily: 'var(--font-display), ui-monospace, monospace',
        }}
      >
        NEXUS Browser
      </div>
      <div
        className="text-[11px] uppercase tracking-widest opacity-70"
        style={{ color: 'var(--phosphor-dim)' }}
      >
        BL · HB · multi-engine
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="border px-3 py-1.5 text-[11px] uppercase tracking-widest transition hover:bg-[var(--bg-deep)]"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--phosphor-bright)',
              fontFamily: 'var(--font-mono), ui-monospace, monospace',
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function FallbackPanel({
  url,
  reason,
  onScreenshot,
  onRaw,
  onNewTab,
  rawContent,
}: {
  url: string
  reason: string
  onScreenshot: () => void
  onRaw: () => void
  onNewTab: () => void
  rawContent: string
}) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 p-6"
      style={{ background: 'var(--card)', color: 'var(--phosphor)' }}
    >
      <AlertTriangle
        className="h-8 w-8"
        style={{ color: 'var(--cyber-magenta)' }}
      />
      <div
        className="text-sm uppercase tracking-widest"
        style={{ color: 'var(--cyber-magenta)' }}
      >
        Site not embeddable
      </div>
      <div
        className="max-w-md text-center text-[11px]"
        style={{ color: 'var(--phosphor-dim)' }}
      >
        {reason || 'The page could not be rendered inline.'}
      </div>
      {url && (
        <div
          className="max-w-md break-all text-[11px]"
          style={{
            color: 'var(--cyber-cyan)',
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
          }}
        >
          {url}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <FallbackButton onClick={onNewTab} icon={ExternalLink} label="Open in new tab" />
        <FallbackButton onClick={onScreenshot} icon={Camera} label="Screenshot" />
        <FallbackButton onClick={onRaw} icon={Code2} label="View HTML" />
      </div>
      {rawContent && (
        <details className="mt-3 w-full max-w-2xl">
          <summary
            className="cursor-pointer text-[10px] uppercase tracking-widest"
            style={{ color: 'var(--phosphor-dim)' }}
          >
            Raw HTML ({rawContent.length} bytes)
          </summary>
          <pre
            className="mt-1 max-h-48 overflow-auto p-2 text-[10px]"
            style={{
              background: 'var(--bg-deep)',
              color: 'var(--pip-amber)',
              fontFamily: 'var(--font-mono), ui-monospace, monospace',
            }}
          >
            {rawContent.slice(0, 4000)}
          </pre>
        </details>
      )}
    </div>
  )
}

function FallbackButton({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void
  icon: typeof ExternalLink
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 border px-3 py-1.5 text-[10px] uppercase tracking-widest transition hover:bg-[var(--bg-deep)]"
      style={{
        borderColor: 'var(--border)',
        color: 'var(--phosphor-bright)',
      }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  )
}

// ----- load dispatcher ---------------------------------------------

async function dispatchLoad(
  engine: Engine,
  mode: Mode,
  url: string,
  selector: string
): Promise<LoadResult> {
  if (mode === 'SEARCH') {
    // Handled upstream by loadSearch; fall through to SMART below to
    // avoid double-dispatch when forceMode is used.
    mode = 'SMART'
  }

  // ---- SMART ----
  if (mode === 'SMART') {
    if (engine === 'BL') {
      const r = await fetchContent(url)
      if (!r.ok || !r.html) {
        return {
          kind: 'fallback',
          url,
          reason: r.error || 'Browserless content fetch returned no HTML',
        }
      }
      const html = injectBaseHref(r.html, url)
      const blob = new Blob([html], { type: 'text/html' })
      const blobUrl = URL.createObjectURL(blob)
      return { kind: 'iframe', blobUrl, html: r.html }
    } else {
      const r = await hbScrape(url)
      if (!r.ok) {
        return {
          kind: 'fallback',
          url,
          reason: r.error || 'Hyperbrowser scrape failed',
        }
      }
      return { kind: 'markdown', markdown: r.markdown || '' }
    }
  }

  // ---- SCRAPE ----
  if (mode === 'SCRAPE') {
    if (engine === 'BL') {
      const r = await blScrape(url, selector || 'body')
      if (!r.ok) {
        return {
          kind: 'fallback',
          url,
          reason: r.error || 'BL scrape failed',
        }
      }
      // BL scrape returns [{selector, results:[{text, html, ...}]}]
      const flat: Array<Record<string, unknown>> = []
      for (const group of r.results ?? []) {
        for (const item of group?.results ?? []) {
          flat.push(item as Record<string, unknown>)
        }
      }
      return { kind: 'scrape', results: flat, selector }
    } else {
      const r = await hbScrape(url)
      if (!r.ok) {
        return {
          kind: 'fallback',
          url,
          reason: r.error || 'HB scrape failed',
        }
      }
      return {
        kind: 'scrape',
        results: [{ markdown: r.markdown, html: r.html }],
        selector,
      }
    }
  }

  // ---- SCREENSHOT ----
  if (mode === 'SCREENSHOT') {
    if (engine === 'BL') {
      const r = await blScreenshot(url)
      if (!r.ok || !r.blobUrl) {
        return {
          kind: 'fallback',
          url,
          reason: r.error || 'BL screenshot failed',
        }
      }
      return { kind: 'screenshot', src: r.blobUrl }
    } else {
      // HB doesn't return images; degrade to BL screenshot.
      const r = await blScreenshot(url)
      if (!r.ok || !r.blobUrl) {
        return {
          kind: 'fallback',
          url,
          reason: r.error || 'HB has no screenshot endpoint; BL fallback failed',
        }
      }
      return { kind: 'screenshot', src: r.blobUrl }
    }
  }

  // ---- PDF ----
  if (mode === 'PDF') {
    const r = await fetchPdf(url)
    if (!r.ok || !r.blobUrl) {
      return {
        kind: 'fallback',
        url,
        reason: r.error || 'BL PDF failed',
      }
    }
    return { kind: 'pdf', blobUrl: r.blobUrl }
  }

  // ---- RAW (MCP) ----
  if (mode === 'RAW') {
    try {
      const r = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'fetch',
          args: { url },
        }),
      })
      const text = await r.text()
      if (!r.ok) {
        return {
          kind: 'fallback',
          url,
          reason: text || `MCP fetch failed (${r.status})`,
        }
      }
      let parsed: unknown = null
      try {
        parsed = text ? JSON.parse(text) : null
      } catch {
        parsed = text
      }
      const content =
        typeof parsed === 'string'
          ? parsed
          : parsed && typeof parsed === 'object' && 'content' in parsed
            ? String((parsed as Record<string, unknown>).content)
            : text
      return {
        kind: 'raw',
        content,
        contentType: 'text/plain',
      }
    } catch (e) {
      return {
        kind: 'fallback',
        url,
        reason: e instanceof Error ? e.message : String(e),
      }
    }
  }

  // Fallback (shouldn't happen)
  return { kind: 'fallback', url, reason: `Unknown mode: ${mode}` }
}

// ----- register ----------------------------------------------------

registerApp({
  id: 'browser',
  name: 'Browser',
  icon: '🌐',
  component: BrowserApp,
  defaultSize: { w: 900, h: 600 },
  minSize: { w: 480, h: 360 },
  singleton: true,
  pinned: true,
  category: 'network',
  title: 'Browser',
})

export default BrowserApp

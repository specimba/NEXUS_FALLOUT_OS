import { NextRequest, NextResponse } from 'next/server'

// GET /api/nexus/content?url=...&mode=bl|hb
//
// BL SMART mode: returns the raw HTML of the page (after a light server-side
// fetch). The browser app injects `<base href>` + a click-intercept script and
// renders it inside a sandboxed blob-URL iframe so CSS/JS/images resolve
// against the real origin and link clicks re-navigate via postMessage.
//
// HB SMART mode: returns the page as plain text / markdown (read-only).
// We strip <script>/<style>, collapse whitespace, and convert <a>/<p>/<li>
// tags into markdown-ish lines. The browser app shows it inline — no iframe.

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 NEXUS-Browser/1.0'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  const mode = (req.nextUrl.searchParams.get('mode') || 'bl').toLowerCase()

  if (!url) {
    return NextResponse.json({ error: 'url query param required' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'only http(s) urls allowed' }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      cache: 'no-store',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'fetch failed', detail: msg }, { status: 502 })
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `upstream ${upstream.status}`, url: parsed.toString() },
      { status: upstream.status },
    )
  }

  const contentType = upstream.headers.get('content-type') || ''
  const raw = await upstream.text()

  if (mode === 'hb') {
    // HB SMART — extract main content as plain text / pseudo-markdown.
    const md = htmlToMarkdown(raw, parsed.toString())
    return NextResponse.json({
      mode: 'hb',
      url: parsed.toString(),
      finalUrl: upstream.url || parsed.toString(),
      contentType,
      markdown: md,
    })
  }

  // BL SMART — return raw HTML (browser app injects <base> + click-intercept).
  return NextResponse.json({
    mode: 'bl',
    url: parsed.toString(),
    finalUrl: upstream.url || parsed.toString(),
    contentType,
    html: raw,
  })
}

// Minimal HTML → markdown extractor for HB SMART mode.
// Strips scripts/styles, keeps links/headings/lists/paragraphs/inline code.
function htmlToMarkdown(html: string, baseUrl: string): string {
  // Drop script/style/noscript/svg entirely.
  let s = html.replace(
    /<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi,
    '',
  )
  // Drop comments.
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  // Title.
  const titleMatch = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : ''
  // Headings.
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl: string, txt: string) => {
    const level = parseInt(lvl, 10)
    return `\n\n${'#'.repeat(level)} ${stripTags(txt).trim()}\n\n`
  })
  // Links — keep text + absolute href.
  s = s.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, txt: string) => {
      const text = stripTags(txt).trim()
      if (!text) return ''
      try {
        const abs = new URL(href, baseUrl).toString()
        return `[${text}](${abs})`
      } catch {
        return text
      }
    })
  // Lists.
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, txt: string) => `\n- ${stripTags(txt).trim()}`)
  s = s.replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n')
  // Paragraphs + breaks.
  s = s.replace(/<p\b[^>]*>/gi, '\n\n')
  s = s.replace(/<\/p>/gi, '\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  // Inline code / pre.
  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_m, txt: string) => `\n\n\`\`\`\n${stripTags(txt).trim()}\n\`\`\`\n\n`)
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, txt: string) => `\`${stripTags(txt)}\``)
  // Blockquote.
  s = s.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, txt: string) =>
    `\n${stripTags(txt).trim().split('\n').map((l) => `> ${l}`).join('\n')}\n`)
  // Strip remaining tags.
  s = stripTags(s)
  // Decode entities.
  s = decodeEntities(s)
  // Collapse whitespace.
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return (title ? `# ${title}\n\n` : '') + s
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(parseInt(n, 10)))
}

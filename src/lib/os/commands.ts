'use client'

// ============================================================
// NEXUS OS — Terminal command engine
//
// ~50 commands grouped:
//   Navigation: ls, cd, pwd, tree
//   File:       cat, touch, mkdir, rm, mv, cp, echo, find, grep,
//               head, tail, wc, less
//   System:     clear, cls, help, man, whoami, date, uptime,
//               neofetch, about, history, reset, exit
//   Settings:   theme, crt, sound, wallpaper
//   Fun:        cowsay, figlet, fortune, play
//   Web:        fetch, scrape, screenshot, search  (REAL /api/browserless)
//   NEXUS:      ask, apps, open, status, nexus, sentinel, watch
//
// CommandContext + CommandResult shapes live in @/lib/os/types.
// Web/AI commands are async (return Promise<CommandResult>).
// ============================================================

import type {
  AppId,
  CommandContext,
  CommandResult,
  OutputLine,
  ThemeId,
  WallpaperId,
} from './types'
import {
  HOME,
  absPath,
  exists as vfsExists,
  getNode,
  listDir,
  pathOf,
  readFile as vfsReadFile,
  resolveDir,
  resolvePath,
} from './vfs'
import {
  LIBRARY,
  MusicPlayerInstance,
  findSong,
  formatTime,
  songDurationSec,
} from './music'
import { useSettingsStore, WALLPAPER_LIST } from '@/stores/settings-store'
import { useFsStore } from '@/stores/fs-store'
import { useAgentRunsStore } from '@/stores/agent-runs-store'
import { listApps } from '@/apps/registry'

// ----- helpers --------------------------------------------------------

export type CommandDef = {
  name: string
  summary: string
  help: string
  run: (args: string[], ctx: CommandContext) => CommandResult | Promise<CommandResult>
  /** Tab-complete the args at a given index. Returns candidate strings. */
  complete?: (args: string[], argIndex: number, ctx: CommandContext) => string[]
}

export type Out = OutputLine
const text = (t: string): Out => ({ type: 'text', text })
const err = (t: string): Out => ({ type: 'error', text })
const ok = (t: string): Out => ({ type: 'success', text })
const dim = (t: string): Out => ({ type: 'dim', text })
const ascii = (t: string): Out => ({ type: 'ascii', text })

function out(...lines: Out[]): CommandResult {
  return { output: lines }
}

/** Tokenize a command line into [name, ...args], respecting simple quotes. */
export function tokenize(line: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === quote) quote = null
      else cur += c
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === ' ' || c === '\t') {
      if (cur) {
        tokens.push(cur)
        cur = ''
      }
    } else {
      cur += c
    }
  }
  if (cur) tokens.push(cur)
  return tokens
}

function longestCommonPrefix(arr: string[]): string {
  if (arr.length === 0) return ''
  let p = arr[0]
  for (let i = 1; i < arr.length; i++) {
    while (!arr[i].startsWith(p)) p = p.slice(0, -1)
    if (!p) break
  }
  return p
}

/** Tab-complete a filesystem path prefix, listing matching children. */
function completePath(prefix: string, ctx: CommandContext): string[] {
  let dirPart = ''
  let namePrefix = prefix
  if (prefix.includes('/')) {
    const idx = prefix.lastIndexOf('/')
    dirPart = prefix.slice(0, idx + 1)
    namePrefix = prefix.slice(idx + 1)
  }
  const dir = resolveDir(ctx.fs, dirPart || '.', ctx.cwd)
  if (!dir) return []
  const children = listDir(ctx.fs, dirPart || '.', ctx.cwd) ?? []
  return children
    .filter((c) => c.name.startsWith(namePrefix))
    .map((c) => (c.type === 'dir' ? dirPart + c.name + '/' : dirPart + c.name))
}

// =====================================================================
// NAVIGATION
// =====================================================================

function lsCmd(args: string[], ctx: CommandContext): CommandResult {
  const flags = args.filter((a) => a.startsWith('-'))
  const paths = args.filter((a) => !a.startsWith('-'))
  const showAll = flags.some((f) => f.includes('a'))
  const longFmt = flags.some((f) => f.includes('l'))
  const target = paths[0] ?? '.'
  const node = getNode(ctx.fs, target, ctx.cwd)
  if (!node) return out(err(`ls: ${target}: no such file or directory`))
  if (node.type === 'file') return out(text(node.name))
  const children = listDir(ctx.fs, target, ctx.cwd) ?? []
  let entries = children
  if (!showAll) entries = entries.filter((c) => !c.name.startsWith('.'))
  if (entries.length === 0) return out()
  if (longFmt) {
    const lines: Out[] = entries.map((c) => {
      const size = c.type === 'file' ? (c.content?.length ?? 0) : 0
      const kind = c.type === 'dir' ? 'd' : '-'
      const name = c.type === 'dir' ? c.name + '/' : c.name
      return text(`${kind}  ${String(size).padStart(6)}  ${name}`)
    })
    return { output: lines }
  }
  // Columnar layout.
  const named = entries.map((e) =>
    e.type === 'dir' ? e.name + '/' : e.name
  )
  const maxLen = Math.max(...named.map((n) => n.length), 1)
  const cols = Math.max(1, Math.floor(72 / (maxLen + 2)))
  const lines: Out[] = []
  for (let i = 0; i < named.length; i += cols) {
    const row = named.slice(i, i + cols)
    lines.push(text(row.map((n) => n.padEnd(maxLen + 2)).join('')))
  }
  return { output: lines }
}

function cdCmd(args: string[], ctx: CommandContext): CommandResult {
  const target = args[0] ?? HOME
  if (target === '-') return out(text(ctx.cwd))
  const node = getNode(ctx.fs, target, ctx.cwd)
  if (!node) return out(err(`cd: ${target}: no such file or directory`))
  if (node.type !== 'dir') return out(err(`cd: ${target}: not a directory`))
  const p = absPath(target, ctx.cwd)
  ctx.setCwd(p)
  return out()
}

function pwdCmd(_args: string[], ctx: CommandContext): CommandResult {
  return out(text(ctx.cwd))
}

function treeCmd(args: string[], ctx: CommandContext): CommandResult {
  const target = args[0] ?? '.'
  const node = getNode(ctx.fs, target, ctx.cwd)
  if (!node) return out(err(`tree: ${target}: no such file or directory`))
  if (node.type === 'file') return out(text(node.name))
  const lines: Out[] = [text(node.name === '/' ? '/' : node.name)]
  const MAX = 200
  let count = 0
  const walk = (parentId: string, prefix: string) => {
    const kids = listDir(ctx.fs, pathOf(ctx.fs, parentId), ctx.cwd) ?? []
    kids.forEach((c, i) => {
      if (count >= MAX) return
      const last = i === kids.length - 1
      const branch = last ? '└── ' : '├── '
      const name = c.type === 'dir' ? c.name + '/' : c.name
      lines.push(text(prefix + branch + name))
      count++
      if (c.type === 'dir') {
        walk(c.id, prefix + (last ? '    ' : '│   '))
      }
    })
  }
  walk(node.id, '')
  if (count >= MAX) lines.push(dim(`... (truncated at ${MAX} entries)`))
  return { output: lines }
}

// =====================================================================
// FILE
// =====================================================================

function catCmd(args: string[], ctx: CommandContext): CommandResult {
  if (args.length === 0) return out(err('cat: missing file operand'))
  const lines: Out[] = []
  for (const a of args) {
    const content = vfsReadFile(ctx.fs, a, ctx.cwd)
    if (content === null) {
      const node = getNode(ctx.fs, a, ctx.cwd)
      if (node && node.type === 'dir') lines.push(err(`cat: ${a}: is a directory`))
      else lines.push(err(`cat: ${a}: no such file or directory`))
      continue
    }
    const trimmed = content.replace(/\n$/, '')
    if (trimmed !== '') {
      for (const ln of trimmed.split('\n')) lines.push(text(ln))
    }
  }
  return { output: lines }
}

function touchCmd(args: string[], ctx: CommandContext): CommandResult {
  if (args.length === 0) return out(err('touch: missing file operand'))
  const lines: Out[] = []
  for (const a of args) {
    if (vfsExists(ctx.fs, a, ctx.cwd)) continue
    const r = ctx.writeFile(a, '')
    if (r === null) lines.push(err(`touch: cannot create '${a}'`))
  }
  return { output: lines }
}

function mkdirCmd(args: string[], ctx: CommandContext): CommandResult {
  if (args.length === 0) return out(err('mkdir: missing operand'))
  const lines: Out[] = []
  for (const a of args) {
    const r = ctx.createDir(a)
    if (r === null) lines.push(err(`mkdir: cannot create directory '${a}'`))
  }
  return { output: lines }
}

function rmCmd(args: string[], ctx: CommandContext): CommandResult {
  const flags = args.filter((a) => a.startsWith('-'))
  const paths = args.filter((a) => !a.startsWith('-'))
  const recursive = flags.some((f) => f.includes('r') || f.includes('R'))
  if (paths.length === 0) return out(err('rm: missing operand'))
  const lines: Out[] = []
  for (const p of paths) {
    const node = getNode(ctx.fs, p, ctx.cwd)
    if (!node) {
      lines.push(err(`rm: ${p}: no such file or directory`))
      continue
    }
    if (node.type === 'dir' && !recursive) {
      lines.push(err(`rm: ${p}: is a directory (use -r)`))
      continue
    }
    if (!ctx.remove(p)) lines.push(err(`rm: cannot remove '${p}'`))
  }
  return { output: lines }
}

function mvCmd(args: string[], ctx: CommandContext): CommandResult {
  if (args.length < 2) return out(err('mv: missing destination'))
  const [from, to] = args
  if (!ctx.move(from, to)) return out(err(`mv: cannot move '${from}' to '${to}'`))
  return out()
}

function cpCmd(args: string[], ctx: CommandContext): CommandResult {
  if (args.length < 2) return out(err('cp: missing destination'))
  const [from, to] = args
  if (!ctx.copy(from, to)) return out(err(`cp: cannot copy '${from}' to '${to}'`))
  return out()
}

function echoCmd(args: string[], _ctx: CommandContext): CommandResult {
  // Support `echo text > file` redirection (single file, overwrite).
  const redirIdx = args.indexOf('>')
  if (redirIdx >= 0 && args.length > redirIdx + 1) {
    const textStr = args.slice(0, redirIdx).join(' ')
    const target = args[redirIdx + 1]
    _ctx.writeFile(target, textStr + '\n')
    return out()
  }
  return out(text(args.join(' ')))
}

function findCmd(args: string[], ctx: CommandContext): CommandResult {
  let startPath = '.'
  let namePattern: string | null = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-name' && i + 1 < args.length) {
      namePattern = args[++i]
    } else if (!a.startsWith('-')) {
      startPath = a
    }
  }
  const start = getNode(ctx.fs, startPath, ctx.cwd)
  if (!start) return out(err(`find: '${startPath}': no such file or directory`))
  const lines: Out[] = []
  const baseAbs = absPath(startPath, ctx.cwd)
  const walk = (id: string, relPath: string) => {
    const node = ctx.fs[id]
    if (!node) return
    if (id !== start.id) {
      const full = relPath
      if (!namePattern || matchGlob(node.name, namePattern)) {
        lines.push(text((baseAbs === '/' ? '' : baseAbs) + (full.startsWith('/') ? full : '/' + full)))
      }
    }
    if (node.type !== 'dir') return
    for (const cid in ctx.fs) {
      const c = ctx.fs[cid]
      if (c.parentId === id) walk(cid, relPath + '/' + c.name)
    }
  }
  walk(start.id, '')
  if (lines.length === 0) return out()
  return { output: lines }
}

function matchGlob(name: string, pattern: string): boolean {
  // very small glob: * matches any sequence
  const re = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    'i'
  )
  return re.test(name)
}

function grepCmd(args: string[], ctx: CommandContext): CommandResult {
  const flags = args.filter((a) => a.startsWith('-'))
  const rest = args.filter((a) => !a.startsWith('-'))
  if (rest.length === 0) return out(err('grep: missing pattern'))
  const caseInsensitive = flags.some((f) => f.includes('i'))
  const pattern = caseInsensitive ? rest[0].toLowerCase() : rest[0]
  const targets = rest.slice(1)
  // If no targets, scan every file under cwd.
  const files: { path: string; content: string }[] = []
  if (targets.length === 0) {
    const collect = (id: string) => {
      const n = ctx.fs[id]
      if (!n) return
      if (n.type === 'file') {
        files.push({ path: pathOf(ctx.fs, id), content: n.content ?? '' })
      } else {
        for (const cid in ctx.fs) {
          if (ctx.fs[cid].parentId === id) collect(cid)
        }
      }
    }
    const cwdNode = getNode(ctx.fs, '.', ctx.cwd)
    if (cwdNode) collect(cwdNode.id)
  } else {
    for (const t of targets) {
      const content = vfsReadFile(ctx.fs, t, ctx.cwd)
      if (content === null) {
        return out(err(`grep: ${t}: no such file or directory`))
      }
      files.push({ path: t, content })
    }
  }
  const lines: Out[] = []
  for (const f of files) {
    const fileLines = f.content.split('\n')
    for (let i = 0; i < fileLines.length; i++) {
      const line = fileLines[i]
      const hay = caseInsensitive ? line.toLowerCase() : line
      if (hay.includes(pattern)) {
        const prefix = targets.length > 1 || files.length > 1 ? `${f.path}:` : ''
        lines.push(text(`${prefix}${i + 1}: ${line}`))
      }
    }
  }
  return { output: lines }
}

function headCmd(args: string[], ctx: CommandContext): CommandResult {
  return headTail(args, ctx, true)
}

function tailCmd(args: string[], ctx: CommandContext): CommandResult {
  return headTail(args, ctx, false)
}

function headTail(args: string[], ctx: CommandContext, isHead: boolean): CommandResult {
  let n = 10
  const paths: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if ((a === '-n' || a === '-lines') && i + 1 < args.length) {
      n = parseInt(args[++i], 10)
      if (Number.isNaN(n) || n < 0) n = 10
    } else if (a.startsWith('-n')) {
      const v = parseInt(a.slice(2), 10)
      if (!Number.isNaN(v)) n = v
    } else if (!a.startsWith('-')) {
      paths.push(a)
    }
  }
  if (paths.length === 0) return out(err(`${isHead ? 'head' : 'tail'}: missing file operand`))
  const lines: Out[] = []
  for (const p of paths) {
    const content = vfsReadFile(ctx.fs, p, ctx.cwd)
    if (content === null) {
      lines.push(err(`${isHead ? 'head' : 'tail'}: ${p}: no such file or directory`))
      continue
    }
    const all = content.split('\n').filter((_, idx, arr) => idx < arr.length - 1 || arr[arr.length - 1] !== '')
    const slice = isHead ? all.slice(0, n) : all.slice(Math.max(0, all.length - n))
    if (paths.length > 1) lines.push(ascii(`==> ${p} <==`))
    for (const ln of slice) lines.push(text(ln))
  }
  return { output: lines }
}

function wcCmd(args: string[], ctx: CommandContext): CommandResult {
  const flags = args.filter((a) => a.startsWith('-'))
  const paths = args.filter((a) => !a.startsWith('-'))
  const wantL = flags.length === 0 || flags.some((f) => f.includes('l'))
  const wantW = flags.length === 0 || flags.some((f) => f.includes('w'))
  const wantC = flags.length === 0 || flags.some((f) => f.includes('c'))
  if (paths.length === 0) return out(err('wc: missing file operand'))
  const lines: Out[] = []
  for (const p of paths) {
    const content = vfsReadFile(ctx.fs, p, ctx.cwd)
    if (content === null) {
      lines.push(err(`wc: ${p}: no such file or directory`))
      continue
    }
    const lineCount = content.split('\n').length - (content.endsWith('\n') ? 1 : 0)
    const wordCount = content.split(/\s+/).filter(Boolean).length
    const charCount = content.length
    const parts: string[] = []
    if (wantL) parts.push(String(lineCount).padStart(5))
    if (wantW) parts.push(String(wordCount).padStart(5))
    if (wantC) parts.push(String(charCount).padStart(5))
    lines.push(text(`${parts.join(' ')}  ${p}`))
  }
  return { output: lines }
}

function lessCmd(args: string[], ctx: CommandContext): CommandResult {
  if (args.length === 0) return out(err('less: missing file operand'))
  const content = vfsReadFile(ctx.fs, args[0], ctx.cwd)
  if (content === null) return out(err(`less: ${args[0]}: no such file or directory`))
  return { openManual: content }
}

// =====================================================================
// SYSTEM
// =====================================================================

function clearCmd(_args: string[], _ctx: CommandContext): CommandResult {
  return { clear: true, output: [] }
}

function whoamiCmd(_args: string[], ctx: CommandContext): CommandResult {
  return out(text(ctx.username))
}

function dateCmd(_args: string[], _ctx: CommandContext): CommandResult {
  return out(text(new Date().toString()))
}

const BOOT_TIME = Date.now()
function uptimeStr(): string {
  const s = Math.floor((Date.now() - BOOT_TIME) / 1000)
  const sec = s % 60
  const m = Math.floor(s / 60)
  if (m === 0) return `${sec}s`
  const h = Math.floor(m / 60)
  if (h === 0) return `${m}m ${sec}s`
  return `${h}h ${m % 60}m ${sec}s`
}

function uptimeCmd(_args: string[], _ctx: CommandContext): CommandResult {
  return out(text(`up ${uptimeStr()}`))
}

function neofetchCmd(_args: string[], ctx: CommandContext): CommandResult {
  const song = MusicPlayerInstance.currentSong()
  const playing = MusicPlayerInstance.isPlaying()
  const appsCount = listApps().length
  const lines: Out[] = [
    ascii('    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗     ' + ctx.username + '@nexus'),
    ascii('    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝     ----------------'),
    ascii('    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗     OS: NEXUS OS v5.0 (Phosphor)'),
    ascii('    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║     Shell: nexus-sh 1.0'),
    ascii('    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║     CRT: ' + (ctx.crt ? 'on' : 'off') + ' · Keys: ' + (ctx.sound ? 'clicky' : 'silent')),
    ascii('    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝     Theme: ' + ctx.theme + ' · Uptime: ' + uptimeStr()),
    ascii('                                                    Apps: ' + appsCount + ' registered'),
  ]
  if (song && playing) lines.push(ascii('                                                    Now playing: ' + song.title))
  lines.push(dim(''))
  lines.push(dim('    "Governance first. Proposal-bound. Provenance-tracked."'))
  return { output: lines }
}

function historyCmd(_args: string[], ctx: CommandContext): CommandResult {
  // ctx.pushLine is the live push; history is owned by the terminal app.
  // We pull it from the local-storage-backed history key if available.
  let h: string[] = []
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('nexus:history:v1')
      if (raw) h = JSON.parse(raw) as string[]
    } catch {
      /* ignore */
    }
  }
  if (h.length === 0) return out(dim('(no history yet)'))
  return { output: h.map((cmd, i) => dim(`  ${String(i + 1).padStart(3)}  ${cmd}`)) }
}

function resetCmd(_args: string[], _ctx: CommandContext): CommandResult {
  useFsStore.getState().reset()
  return out(ok('filesystem reset to factory state.'))
}

function exitCmd(_args: string[], _ctx: CommandContext): CommandResult {
  // In a windowed OS we don't really exit; just clear + banner.
  return { clear: true, output: [dim('(terminal session cleared)')] }
}

// =====================================================================
// SETTINGS
// =====================================================================

function themeCmd(args: string[], ctx: CommandContext): CommandResult {
  const all: ThemeId[] = ['green', 'amber', 'cyan', 'white']
  if (args.length === 0) {
    return out(
      dim('usage: theme <green|amber|cyan|white>'),
      dim(`current: ${ctx.theme}   available: ${all.join(', ')}`)
    )
  }
  const id = args[0].toLowerCase() as ThemeId
  if (!all.includes(id)) {
    return out(err(`theme: unknown theme '${args[0]}'. options: ${all.join(', ')}`))
  }
  ctx.setTheme(id)
  return out(ok(`theme set: ${id}`))
}

function crtCmd(args: string[], ctx: CommandContext): CommandResult {
  if (args.length === 0) {
    ctx.setCrt(!ctx.crt)
  } else {
    ctx.setCrt(args[0] === 'on')
  }
  return out(dim(`scanlines: ${ctx.crt ? 'on' : 'off'}`))
}

function soundCmd(args: string[], ctx: CommandContext): CommandResult {
  if (args.length === 0) {
    return out(dim(`key sounds: ${ctx.sound ? 'on' : 'off'}  (usage: sound on|off)`))
  }
  ctx.setSound(args[0] === 'on')
  return out(ok(`key sounds: ${ctx.sound ? 'on' : 'off'}`))
}

function wallpaperCmd(args: string[], _ctx: CommandContext): CommandResult {
  const all = WALLPAPER_LIST.map((w) => w.id)
  if (args.length === 0) {
    const cur = useSettingsStore.getState().wallpaper
    return out(
      dim('usage: wallpaper <id>'),
      dim(`current: ${cur}   available: ${all.join(', ')}`)
    )
  }
  const id = args[0].toLowerCase() as WallpaperId
  if (!all.includes(id)) {
    return out(err(`wallpaper: unknown '${args[0]}'. options: ${all.join(', ')}`))
  }
  useSettingsStore.getState().setWallpaper(id)
  return out(ok(`wallpaper set: ${id}`))
}

// =====================================================================
// FUN
// =====================================================================

function cowsayCmd(args: string[], _ctx: CommandContext): CommandResult {
  const msg = args.join(' ') || 'moo'
  const top = ' ' + '_'.repeat(msg.length + 2)
  const bot = ' ' + '-'.repeat(msg.length + 2)
  const cow = `
${top}
< ${msg} >
${bot}
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||`
  return { output: cow.split('\n').map((l) => ascii(l)) }
}

const FORTUNES: string[] = [
  'Governance first. Every action is proposal-bound, test-gated, provenance-tracked.',
  'The vault never forgets. Neither does the governor.',
  'Trust is a number between 0 and 5. Yours is provisional.',
  'Stay patched. The wasteland is patient.',
  'A swarm without a foreman is just noise.',
  'Phosphor never lies. It just dims.',
  'Every port is a door. Lock them all.',
  'The brain is LIVE on 7352. Ask it anything.',
  'Cyber-magenta is the colour of ACCESS DENIED.',
  'VAP hash links the past to the present. Verify often.',
]

function fortuneCmd(_args: string[], _ctx: CommandContext): CommandResult {
  const f = FORTUNES[Math.floor(Math.random() * FORTUNES.length)]
  return out(dim(f))
}

// Tiny 5x5 block-letter figlet for A-Z 0-9 + space.
const FIGLET: Record<string, string[]> = {
  A: [' █████ ', '██   ██ ', '███████ ', '██   ██ ', '██   ██ '],
  B: ['██████ ', '██   ██', '██████ ', '██   ██', '██████ '],
  C: [' ██████', '██     ', '██     ', '██     ', ' ██████'],
  D: ['██████ ', '██   ██', '██   ██', '██   ██', '██████ '],
  E: ['███████', '██     ', '█████  ', '██     ', '███████'],
  F: ['███████', '██     ', '█████  ', '██     ', '██     '],
  G: [' ██████', '██     ', '██  ███', '██   ██', ' ██████'],
  H: ['██   ██', '██   ██', '███████', '██   ██', '██   ██'],
  I: ['██', '██', '██', '██', '██'],
  J: ['     ██', '     ██', '     ██', '██   ██', ' █████ '],
  K: ['██   ██', '██  ██ ', '█████  ', '██  ██ ', '██   ██'],
  L: ['██     ', '██     ', '██     ', '██     ', '███████'],
  M: ['███    ███', '████  ████', '██ ████ ██', '██  ██  ██', '██      ██'],
  N: ['███    ██', '████   ██', '██ ██  ██', '██  ██ ██', '██   ████'],
  O: [' ██████ ', '██    ██', '██    ██', '██    ██', ' ██████ '],
  P: ['██████ ', '██   ██', '██████ ', '██     ', '██     '],
  Q: [' ██████ ', '██    ██', '██    ██', '██  ████', ' ███████'],
  R: ['██████ ', '██   ██', '██████ ', '██   ██', '██   ██'],
  S: [' ██████', '██     ', ' █████ ', '     ██', '██████ '],
  T: ['███████', '  ██   ', '  ██   ', '  ██   ', '  ██   '],
  U: ['██   ██', '██   ██', '██   ██', '██   ██', ' █████ '],
  V: ['██   ██', '██   ██', '██   ██', ' ██ ██ ', '  ███  '],
  W: ['██    ██', '██    ██', '██ ██ ██', '████████', '██    ██'],
  X: ['██   ██', ' ██ ██ ', '  ███  ', ' ██ ██ ', '██   ██'],
  Y: ['██   ██', ' ██ ██ ', '  ███  ', '  ██   ', '  ██   '],
  Z: ['███████', '    ██ ', '  ██   ', ' ██    ', '███████'],
  ' ': ['  ', '  ', '  ', '  ', '  '],
  '0': [' ██████ ', '██  ████', '██ ██ ██', '████  ██', ' ██████ '],
  '1': ['  ██ ', ' ███ ', '  ██ ', '  ██ ', '█████'],
  '2': ['██████ ', '    ██ ', ' █████ ', '██     ', '███████'],
  '3': ['██████ ', '    ██ ', ' █████ ', '    ██ ', '██████ '],
  '4': ['██   ██', '██   ██', '███████', '     ██', '     ██'],
  '5': ['███████', '██     ', '███████', '     ██', '███████'],
  '6': [' ██████', '██     ', '███████', '██   ██', ' █████ '],
  '7': ['███████', '    ██ ', '   ██  ', '  ██   ', ' ██    '],
  '8': [' █████ ', '██   ██', ' █████ ', '██   ██', ' █████ '],
  '9': [' █████ ', '██   ██', ' ██████', '     ██', ' █████ '],
}

function figletCmd(args: string[], _ctx: CommandContext): CommandResult {
  const msg = (args.join(' ') || 'NEXUS').toUpperCase()
  const rows: string[] = ['', '', '', '', '']
  for (const ch of msg) {
    const glyph = FIGLET[ch] ?? FIGLET[' ']
    for (let i = 0; i < 5; i++) rows[i] += glyph[i] + ' '
  }
  return { output: rows.map((r) => ascii(r)) }
}

function playCmd(args: string[], _ctx: CommandContext): CommandResult {
  const sub = args[0]
  if (!sub || sub === 'list') {
    const lines: Out[] = [
      ascii('MUSIC LIBRARY'),
      text('  id            title          time   genre'),
    ]
    for (const s of LIBRARY) {
      lines.push(
        text(
          `  ${s.id.padEnd(13)} ${s.title.padEnd(14)} ${formatTime(songDurationSec(s)).padEnd(6)} ${s.genre}`
        )
      )
    }
    lines.push(dim(''))
    const np = MusicPlayerInstance.currentSong()
    if (np && MusicPlayerInstance.isPlaying()) {
      lines.push(ok(`now playing: ${np.title} — ${np.artist}`))
    } else {
      lines.push(dim('usage: play <song-id>   |   play stop'))
    }
    return { output: lines }
  }
  if (sub === 'stop') {
    MusicPlayerInstance.stop()
    return out(dim('playback stopped.'))
  }
  const song = findSong(sub)
  if (!song) {
    return out(err(`play: no such song '${sub}'. try 'play list'.`))
  }
  MusicPlayerInstance.play(song)
  return out(
    ok(`▶ playing: ${song.title} — ${song.artist}  [${song.genre}]`),
    dim(`  ${formatTime(0)} / ${formatTime(songDurationSec(song))}`)
  )
}

// =====================================================================
// WEB (calls REAL /api/browserless)
// =====================================================================

/**
 * Call the REAL /api/browserless route. The route takes
 * { endpoint, payload } and proxies to Browserless.io.
 * Returns the parsed JSON body (or raw text for non-JSON responses).
 */
async function callBrowserless(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<{ data: unknown; contentType: string }> {
  const res = await fetch('/api/browserless', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, payload }),
  })
  const ct = res.headers.get('content-type') ?? ''
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? ` — ${txt.slice(0, 200)}` : ''}`)
  }
  if (ct.includes('application/json')) {
    const data = (await res.json()) as unknown
    return { data, contentType: ct }
  }
  // image, pdf, html — return as text
  const txt = await res.text().catch(() => '')
  return { data: txt, contentType: ct }
}

function pickText(data: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = data[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return JSON.stringify(data, null, 2)
}

async function fetchCmd(args: string[], _ctx: CommandContext): Promise<CommandResult> {
  const url = args.find((a) => !a.startsWith('-'))
  if (!url) return out(err('usage: fetch <url>   (retrieves page content via /api/browserless)'))
  try {
    const { data, contentType } = await callBrowserless('content', { url })
    const lines: Out[] = [ascii(`▸ fetch — ${url}`), dim(`  content-type: ${contentType || 'unknown'}`), dim('  ────────────────────────────────────')]
    if (typeof data === 'string') {
      // raw HTML or text
      const sliced = data.slice(0, 4000)
      for (const ln of sliced.split('\n').slice(0, 200)) {
        if (ln.trim()) lines.push(text(ln))
      }
      if (data.length > 4000) lines.push(dim('  … (truncated)'))
    } else if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      const title = typeof d.title === 'string' ? d.title : ''
      const body = pickText(d, ['content', 'text', 'markdown', 'description', 'html'])
      if (title) lines.push(ascii(`  title: ${title}`))
      for (const ln of body.split('\n').slice(0, 200)) {
        if (ln.trim()) lines.push(text(ln))
      }
      if (body.split('\n').length > 200) lines.push(dim('  … (truncated)'))
    }
    return { output: lines }
  } catch (e) {
    return out(err(`fetch: ${(e as Error).message}`))
  }
}

async function scrapeCmd(args: string[], _ctx: CommandContext): Promise<CommandResult> {
  const url = args.find((a) => !a.startsWith('-'))
  if (!url) return out(err('usage: scrape <url>   (extracts clean content via /api/browserless)'))
  try {
    const { data, contentType } = await callBrowserless('scrape', { url })
    const lines: Out[] = [ascii(`▸ scrape — ${url}`), dim(`  content-type: ${contentType || 'unknown'}`), dim('  ────────────────────────────────────')]
    if (typeof data === 'string') {
      for (const ln of data.split('\n').slice(0, 200)) {
        if (ln.trim()) lines.push(text(ln))
      }
    } else if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      // BL /scrape typically returns { results: [{ html, text, data: {...} }] }
      const results = Array.isArray(d.results) ? d.results : []
      if (results.length === 0) {
        lines.push(dim('  (no results[] in response — dumping JSON)'))
        lines.push(text(JSON.stringify(d, null, 2).slice(0, 600)))
      } else {
        for (let i = 0; i < Math.min(3, results.length); i++) {
          const r = results[i] as Record<string, unknown>
          const textContent = typeof r.text === 'string' ? r.text : typeof r.html === 'string' ? r.html : ''
          lines.push(dim(`  result ${i + 1}:`))
          for (const ln of textContent.split('\n').slice(0, 50)) {
            if (ln.trim()) lines.push(text('    ' + ln))
          }
        }
      }
    }
    return { output: lines }
  } catch (e) {
    return out(err(`scrape: ${(e as Error).message}`))
  }
}

async function screenshotCmd(args: string[], _ctx: CommandContext): Promise<CommandResult> {
  const url = args.find((a) => !a.startsWith('-'))
  if (!url) return out(err('usage: screenshot <url>   (captures a PNG via /api/browserless)'))
  try {
    const { data, contentType } = await callBrowserless('screenshot', { url })
    const isImage = contentType.startsWith('image/')
    const size = typeof data === 'string' ? data.length : 0
    return out(
      ascii(`▸ screenshot — ${url}`),
      ok(`  captured: ${contentType || 'unknown'}${isImage ? ` (${size} bytes)` : ''}`),
      dim('  (open the Browser app to view rendered images)'),
      !isImage && typeof data === 'string' && data.length > 0
        ? dim(`  response: ${data.slice(0, 200)}`)
        : dim('  response: (binary image data)')
    )
  } catch (e) {
    return out(err(`screenshot: ${(e as Error).message}`))
  }
}

async function searchCmd(args: string[], _ctx: CommandContext): Promise<CommandResult> {
  const query = args.join(' ').trim()
  if (!query) return out(err('usage: search <query>   (web search via /api/browserless)'))
  try {
    const { data } = await callBrowserless('search', { query })
    const lines: Out[] = [ascii(`▸ search — ${query}`), dim('  ────────────────────────────────────')]
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      // BL /search returns { organicResults: [...] } or { results: [...] }
      const results = Array.isArray(d.organicResults)
        ? d.organicResults
        : Array.isArray(d.results)
          ? d.results
          : []
      if (results.length === 0) {
        lines.push(dim('  (no results in response — dumping JSON)'))
        lines.push(text(JSON.stringify(d, null, 2).slice(0, 600)))
      } else {
        for (let i = 0; i < Math.min(10, results.length); i++) {
          const r = results[i] as Record<string, unknown>
          const title = typeof r.title === 'string' ? r.title : '(untitled)'
          const url = typeof r.url === 'string' ? r.url : typeof r.link === 'string' ? r.link : ''
          const snip =
            typeof r.description === 'string'
              ? r.description
              : typeof r.snippet === 'string'
                ? r.snippet
                : ''
          lines.push(text(`  ${i + 1}. ${title}`))
          if (url) lines.push(dim(`     ${url}`))
          if (snip) lines.push(dim(`     ${snip.slice(0, 160)}`))
        }
      }
    } else if (typeof data === 'string') {
      lines.push(text(data.slice(0, 1000)))
    }
    return { output: lines }
  } catch (e) {
    return out(err(`search: ${(e as Error).message}`))
  }
}

// =====================================================================
// NEXUS
// =====================================================================

async function askCmd(args: string[], _ctx: CommandContext): Promise<CommandResult> {
  const prompt = args.join(' ').trim()
  if (!prompt) return out(err('usage: ask <question>   (calls /api/ai/ask)'))
  try {
    const res = await fetch('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}${txt ? ` — ${txt.slice(0, 200)}` : ''}`)
    }
    const data = (await res.json()) as Record<string, unknown>
    const answer = pickText(data, ['text', 'answer', 'response', 'content', 'reply'])
    const lines: Out[] = [ascii('▸ NEXUS'), dim('  ────────────────────────────────────')]
    for (const ln of answer.split('\n')) {
      if (ln.trim()) lines.push(text(ln))
    }
    return { output: lines }
  } catch (e) {
    return out(err(`ask: ${(e as Error).message}`))
  }
}

function appsCmd(_args: string[], _ctx: CommandContext): CommandResult {
  const apps = listApps()
  if (apps.length === 0) return out(dim('(no apps registered)'))
  const lines: Out[] = [
    ascii('REGISTERED APPS'),
    text('  id                name              category   pinned'),
    dim('  ─────────────────────────────────────────────────────────'),
  ]
  for (const a of apps) {
    lines.push(
      text(
        `  ${a.id.padEnd(17)} ${a.name.padEnd(17)} ${(a.category ?? 'system').padEnd(10)} ${a.pinned ? '★' : ' '}`
      )
    )
  }
  lines.push(dim(''))
  lines.push(dim('open any app with:  open <id>'))
  return { output: lines }
}

function openCmd(args: string[], ctx: CommandContext): CommandResult {
  if (args.length === 0) return out(err('usage: open <app-id>'))
  const id = args[0] as AppId
  const app = listApps().find((a) => a.id === id || a.id.startsWith(args[0]))
  if (!app) return out(err(`open: no such app '${args[0]}'. try 'apps' to list.`))
  ctx.openApp(app.id, { title: app.title ?? app.name })
  return out(ok(`opening ${app.name}…`))
}

function statusCmd(_args: string[], ctx: CommandContext): CommandResult {
  try {
    const song = MusicPlayerInstance.currentSong()
    const playing = MusicPlayerInstance.isPlaying()
    const runs = useAgentRunsStore.getState().runs
    const active = runs.filter(
      (r) => r.status === 'running' || r.status === 'pending' || r.status === 'awaiting-approval'
    )
    const fsNodeCount = Object.keys(ctx.fs).length
    const lines: Out[] = [
      ascii('╔═ NEXUS OS — STATUS ════════════════════════════════╗'),
      text(`  user: ${ctx.username}        cwd: ${shortCwd(ctx.cwd)}`),
      text(`  phase: desktop       uptime: ${uptimeStr()}`),
      text(`  theme: ${ctx.theme}    crt: ${ctx.crt ? 'on' : 'off'}    sound: ${ctx.sound ? 'on' : 'off'}`),
      text(`  fs nodes: ${fsNodeCount}     apps: ${listApps().length}`),
      text(`  agent runs: ${runs.length} total, ${active.length} active`),
      text(`  music: ${playing && song ? `▶ ${song.title} — ${song.artist}` : '(idle)'}`),
      ascii('╚════════════════════════════════════════════════════╝'),
    ]
    if (active.length > 0) {
      lines.push(dim('  active runs:'))
      for (const r of active.slice(0, 5)) {
        lines.push(text(`    ${r.id}  [${r.status}]  ${r.recipe}  —  ${r.task.slice(0, 60)}`))
      }
    }
    return { output: lines }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { output: [{ type: 'error', text: `status: ${msg}` }] }
  }
}

function nexusCmd(args: string[], _ctx: CommandContext): CommandResult {
  const sub = args[0]
  const store = useAgentRunsStore.getState()
  if (!sub || sub === 'status') {
    const runs = store.recentRuns(10)
    if (runs.length === 0) return out(dim('(no nexus runs yet — try: nexus run <task>)'))
    const lines: Out[] = [ascii('▸ NEXUS RUNS'), dim('  ────────────────────────────────────')]
    for (const r of runs) {
      lines.push(text(`  ${r.id}  [${r.status}]  ${r.recipe}`))
      lines.push(dim(`    task: ${r.task.slice(0, 80)}`))
    }
    return { output: lines }
  }
  if (sub === 'run' || sub === 'pipe') {
    const task = args.slice(1).join(' ').trim()
    if (!task) return out(err(`usage: nexus ${sub} <task description>`))
    const id = store.startRun({
      recipe: sub === 'pipe' ? 'nexus-pipe' : 'nexus-cli',
      task,
      engine: 'nexus-cli',
      source: 'terminal',
      steps: [{ label: 'plan' }, { label: 'execute' }, { label: 'verify' }],
    })
    // Auto-advance through the steps for visual feedback.
    void advanceRun(id)
    return out(ok(`▶ nexus ${sub} started: ${id}`), dim(`  task: ${task.slice(0, 80)}`))
  }
  if (sub === 'stop') {
    const runId = args[1]
    if (!runId) return out(err('usage: nexus stop <run-id>'))
    store.endRun(runId, 'cancelled')
    return out(ok(`nexus: stopped ${runId}`))
  }
  return out(err(`nexus: unknown subcommand '${sub}'. try: run | pipe | status | stop`))
}

async function advanceRun(runId: string): Promise<void> {
  const store = useAgentRunsStore.getState()
  const run = store.runs.find((r) => r.id === runId)
  if (!run) return
  for (let i = 0; i < run.steps.length; i++) {
    const stepId = run.steps[i].id
    useAgentRunsStore.getState().updateStep(runId, stepId, { status: 'running' })
    await sleep(700)
    useAgentRunsStore.getState().updateStep(runId, stepId, { status: 'done' })
  }
  useAgentRunsStore.getState().endRun(runId, 'done', 'nexus-cli: all steps completed (demo)')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function sentinelCmd(args: string[], _ctx: CommandContext): CommandResult {
  try {
    const sub = args[0]
    const store = useAgentRunsStore.getState()
    if (!sub || sub === 'list') {
      const sentinels = store.runs.filter((r) => r.recipe === 'sentinel')
      if (sentinels.length === 0) return out(dim('(no sentinels — try: sentinel start | sentinel demo)'))
      const lines: Out[] = [ascii('▸ SENTINELS'), dim('  ────────────────────────────────────')]
      for (const r of sentinels) {
        lines.push(text(`  ${r.id}  [${r.status}]  ${r.task}`))
      }
      return { output: lines }
    }
    if (sub === 'start') {
      const id = store.startRun({
        recipe: 'sentinel',
        task: 'sentinel monitor',
        engine: 'sentinel',
        source: 'terminal',
        steps: [{ label: 'boot' }, { label: 'watch' }, { label: 'verify' }],
      })
      void advanceRun(id)
      return out(ok(`▶ sentinel started: ${id}`))
    }
    if (sub === 'demo') {
      const id = store.startRun({
        recipe: 'sentinel',
        task: 'sentinel demo sweep',
        engine: 'sentinel',
        source: 'terminal',
        steps: [{ label: 'scan' }, { label: 'analyze' }, { label: 'report' }],
      })
      void advanceRun(id)
      return out(
        ok(`▶ sentinel demo started: ${id}`),
        dim('  scan ▸ analyze ▸ report — watch the run panel for live progress'),
        ascii('  ┌─ SENTINEL DEMO ──────────────────────────────────┐'),
        text('  │  scan    • enumerating surfaces                  │'),
        text('  │  analyze • cross-referencing signatures          │'),
        text('  │  report  • emitting findings                     │'),
        ascii('  └──────────────────────────────────────────────────┘'),
      )
    }
    if (sub === 'stop') {
      const runId = args[1]
      if (!runId) return out(err('usage: sentinel stop <run-id>'))
      store.endRun(runId, 'cancelled')
      return out(ok(`sentinel: stopped ${runId}`))
    }
    return out(err(`sentinel: unknown subcommand '${sub}'. try: start | list | stop | demo`))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { output: [{ type: 'error', text: `sentinel: ${msg}` }] }
  }
}

async function watchCmd(args: string[], ctx: CommandContext): Promise<CommandResult> {
  let interval = 3
  let rest: string[]
  const n = parseInt(args[0] ?? '', 10)
  if (!Number.isNaN(n) && args.length > 1) {
    interval = Math.max(1, Math.min(60, n))
    rest = args.slice(1)
  } else {
    rest = args
  }
  if (rest.length === 0) {
    return out(err('usage: watch [interval-sec] <command...>   e.g. watch 2 status'))
  }
  const subName = rest[0]
  const subArgs = rest.slice(1)
  const subDef = COMMANDS[subName]
  if (!subDef) return out(err(`watch: unknown command '${subName}'`))
  if (subName === 'watch' || subName === 'less' || subName === 'help') {
    return out(err(`watch: cannot nest '${subName}'`))
  }
  let stopped = false
  let timer: ReturnType<typeof setInterval> | null = null
  const stop = () => {
    stopped = true
    if (timer) clearInterval(timer)
    ctx.pushLine({ type: 'dim', text: `└─ watch stopped` })
  }
  ctx.registerStop(stop)
  const runOnce = async () => {
    if (stopped) return
    ctx.pushLine({
      type: 'dim',
      text: `┌─ watch ${subName} ${subArgs.join(' ')}  — ${new Date().toISOString().slice(11, 19)}  (q to stop)`,
    })
    try {
      // Build a fresh ctx so fs/cwd reflect current state.
      const freshFs = useFsStore.getState().vfs
      const freshCwd = useFsStore.getState().cwd
      const subCtx: CommandContext = { ...ctx, fs: freshFs, cwd: freshCwd }
      const res = await subDef.run(subArgs, subCtx)
      if (res.clear) ctx.clearLines()
      if (res.openManual) {
        ctx.pushLine({ type: 'dim', text: '│  (command opens a viewer — skipped in watch mode)' })
      }
      if (res.output) {
        const arr = Array.isArray(res.output) ? res.output : [{ type: 'text' as const, text: res.output }]
        for (const ln of arr) {
          ctx.pushLine({ type: ln.type, text: '│  ' + ln.text })
        }
      }
    } catch (e) {
      ctx.pushLine({ type: 'error', text: `│  error: ${(e as Error).message}` })
    }
    ctx.pushLine({ type: 'dim', text: '│' })
  }
  void runOnce()
  timer = setInterval(() => {
    void runOnce()
  }, interval * 1000)
  // Return empty; live lines stream via ctx.pushLine.
  return { output: [] }
}

// =====================================================================
// HELP
// =====================================================================

function helpCmd(args: string[]): CommandResult {
  if (args[0]) {
    const def = COMMANDS[args[0]]
    if (!def) return out(err(`help: no such command: ${args[0]}`))
    return out(
      ascii('NAME'),
      text(`  ${def.name} — ${def.summary}`),
      text(''),
      ascii('SYNOPSIS'),
      text(`  ${def.help}`)
    )
  }
  return { openManual: MANUAL }
}

// =====================================================================
// MANUAL
// =====================================================================

export const MANUAL = `
NEXUS OS v5.0 — TERMINAL MANUAL  (nexus-sh 1.0)
================================================

NEXUS OS is a bio-pip-cyberpunk AI operating system. This terminal is
the general CLI: navigate the VFS, query the NEXUS AI, run web agents,
spawn sentinels, and tune the phosphor aesthetic. Every web/AI command
hits the REAL /api/browserless or /api/ai/ask routes — no mocks.

NAVIGATION & HISTORY
  Up / Down          recall previous / next command
  Left / Right       move cursor within the line
  Tab                complete the current token (ghost text preview)
  Enter              execute the line
  Ctrl+L             clear the screen
  Ctrl+C             cancel current line (or copy if text selected)
  Ctrl+R             reverse search command history

NAVIGATION COMMANDS
  ls [-l] [-a] [path]   list directory contents
  cd [path]             change directory (default: ~)
  pwd                   print working directory
  tree [path]           print a recursive tree

FILE COMMANDS
  cat <file>...         print file contents
  touch <file>...       create empty files (no-op if exists)
  mkdir <name>...       create directories
  rm [-r] <path>...     remove files (use -r for directories)
  mv <from> <to>        move / rename
  cp <from> <to>        copy (deep)
  echo <text> [> file]  print text (or write to file with >)
  find [path] [-name p] find files (simple glob)
  grep [-i] <pat> [f]   search file contents (or all files in cwd)
  head [-n N] <file>    first N lines (default 10)
  tail [-n N] <file>    last N lines (default 10)
  wc [-l|-w|-c] <file>  count lines / words / chars
  less <file>           open file in the pager

SYSTEM
  clear | cls           clear the screen
  help [command]        show this manual (or a command's detail)
  man [command]         alias for help
  whoami                print current user
  date                  print current date / time
  uptime                print session uptime
  neofetch | about      NEXUS system banner
  history               list command history
  reset                 restore the filesystem to factory state
  exit                  clear the session (windows stay open)

SETTINGS
  theme <green|amber|cyan|white>   switch phosphor theme
  crt [on|off]                     toggle CRT scanlines
  sound [on|off]                   toggle mechanical key clicks
  wallpaper <grid|scanlines|noise|aurora|void>   set desktop wallpaper

FUN
  cowsay <msg>          ASCII cow says your message
  figlet <text>         render text as ASCII banner
  fortune               random cyberpunk aphorism
  play [list|stop|<id>] chiptune music player

WEB  (REAL — calls /api/browserless)
  fetch <url>           retrieve page content
  scrape <url>          extract clean markdown
  screenshot <url>      capture a PNG screenshot
  search <query>        web search

NEXUS
  ask <question>        ask the NEXUS AI (calls /api/ai/ask)
  apps                  list registered apps
  open <app-id>         open an app window
  status                full system overview
  nexus run <task>      start a NEXUS agent run
  nexus pipe <task>     start a NEXUS pipe run
  nexus status          list recent runs
  nexus stop <run-id>   cancel a run
  sentinel start        boot a sentinel monitor
  sentinel list         list sentinels
  sentinel stop <id>    stop a sentinel
  sentinel demo         run a sentinel demo sweep
  watch [N] <cmd...>    re-run a command every N seconds (q to stop)

TIPS
  • Start with 'status' for the full picture.
  • 'ls /etc' shows the OS metadata files.
  • 'cat readme.txt' prints the welcome readme.
  • 'play citysleep' queues a track; 'play stop' halts it.
  • 'search phosphor cyberpunk' triggers a real /api/browserless call.
  • 'ask what is NEXUS OS?' routes through /api/ai/ask.
  • In the pager (less / help): q quits, / searches, g/G jump.

Governance first. Every action is proposal-bound, test-gated, provenance-tracked.
Stay patched. — sysop
`.trim()

// =====================================================================
// SHORT CWD
// =====================================================================

export function shortCwd(cwd: string): string {
  if (cwd === HOME) return '~'
  if (cwd.startsWith(HOME + '/')) return '~' + cwd.slice(HOME.length)
  return cwd || '/'
}

// =====================================================================
// COMMAND REGISTRY
// =====================================================================

export const COMMANDS: Record<string, CommandDef> = {
  // navigation
  ls: { name: 'ls', summary: 'list directory contents', help: 'ls [-l] [-a] [path]', run: lsCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  cd: { name: 'cd', summary: 'change directory', help: 'cd [path]   (default: ~)', run: cdCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  pwd: { name: 'pwd', summary: 'print working directory', help: 'pwd', run: pwdCmd },
  tree: { name: 'tree', summary: 'recursive tree view', help: 'tree [path]', run: treeCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },

  // file
  cat: { name: 'cat', summary: 'print file contents', help: 'cat <file> [file...]', run: catCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  touch: { name: 'touch', summary: 'create empty file(s)', help: 'touch <file> [file...]', run: touchCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  mkdir: { name: 'mkdir', summary: 'create directory', help: 'mkdir <name> [name...]', run: mkdirCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  rm: { name: 'rm', summary: 'remove files / dirs', help: 'rm [-r] <path> [path...]', run: rmCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  mv: { name: 'mv', summary: 'move / rename', help: 'mv <from> <to>', run: mvCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  cp: { name: 'cp', summary: 'copy', help: 'cp <from> <to>', run: cpCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  echo: { name: 'echo', summary: 'print text', help: 'echo <text> [> file]', run: echoCmd },
  find: { name: 'find', summary: 'find files', help: 'find [path] [-name pattern]', run: findCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  grep: { name: 'grep', summary: 'search file contents', help: 'grep [-i] <pattern> [file...]', run: grepCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  head: { name: 'head', summary: 'first lines of a file', help: 'head [-n N] <file>', run: headCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  tail: { name: 'tail', summary: 'last lines of a file', help: 'tail [-n N] <file>', run: tailCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  wc: { name: 'wc', summary: 'count lines / words / chars', help: 'wc [-l|-w|-c] <file>', run: wcCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },
  less: { name: 'less', summary: 'open file in pager', help: 'less <file>', run: lessCmd, complete: (a, i, ctx) => completePath(a[i] || '', ctx) },

  // system
  clear: { name: 'clear', summary: 'clear the screen', help: 'clear', run: clearCmd },
  cls: { name: 'cls', summary: 'clear the screen (alias)', help: 'cls', run: clearCmd },
  help: { name: 'help', summary: 'show the manual', help: 'help [command]', run: (a) => helpCmd(a), complete: (a, _i) => COMMAND_NAMES.filter((c) => c.startsWith(a[0] || '')) },
  man: { name: 'man', summary: 'alias for help', help: 'man [command]', run: (a) => helpCmd(a), complete: (a, _i) => COMMAND_NAMES.filter((c) => c.startsWith(a[0] || '')) },
  whoami: { name: 'whoami', summary: 'print current user', help: 'whoami', run: whoamiCmd },
  date: { name: 'date', summary: 'print date / time', help: 'date', run: dateCmd },
  uptime: { name: 'uptime', summary: 'print session uptime', help: 'uptime', run: uptimeCmd },
  neofetch: { name: 'neofetch', summary: 'system summary banner', help: 'neofetch', run: neofetchCmd },
  about: { name: 'about', summary: 'system summary banner (alias)', help: 'about', run: neofetchCmd },
  history: { name: 'history', summary: 'list command history', help: 'history', run: historyCmd },
  reset: { name: 'reset', summary: 'reset filesystem to factory', help: 'reset', run: resetCmd },
  exit: { name: 'exit', summary: 'clear the session', help: 'exit', run: exitCmd },

  // settings
  theme: { name: 'theme', summary: 'switch phosphor theme', help: 'theme <green|amber|cyan|white>', run: themeCmd, complete: (a, _i) => ['green', 'amber', 'cyan', 'white'].filter((t) => t.startsWith((a[0] || '').toLowerCase())) },
  crt: { name: 'crt', summary: 'toggle CRT scanlines', help: 'crt [on|off]', run: crtCmd, complete: (a) => ['on', 'off'].filter((o) => o.startsWith(a[0] || '')) },
  sound: { name: 'sound', summary: 'toggle key clicks', help: 'sound [on|off]', run: soundCmd, complete: (a) => ['on', 'off'].filter((o) => o.startsWith(a[0] || '')) },
  wallpaper: { name: 'wallpaper', summary: 'set desktop wallpaper', help: 'wallpaper <grid|scanlines|noise|aurora|void>', run: wallpaperCmd, complete: (a, _i) => WALLPAPER_LIST.map((w) => w.id).filter((w) => w.startsWith((a[0] || '').toLowerCase())) },

  // fun
  cowsay: { name: 'cowsay', summary: 'ASCII cow says your message', help: 'cowsay <msg>', run: cowsayCmd },
  figlet: { name: 'figlet', summary: 'ASCII banner text', help: 'figlet <text>', run: figletCmd },
  fortune: { name: 'fortune', summary: 'random cyberpunk aphorism', help: 'fortune', run: fortuneCmd },
  play: {
    name: 'play',
    summary: 'chiptune music player',
    help: 'play [list|stop|<song-id>]',
    run: playCmd,
    complete: (a, _i, _ctx) => {
      if (!a[0]) return ['list', 'stop', ...LIBRARY.map((s) => s.id)]
      if (['list', 'stop'].includes(a[0])) return []
      return LIBRARY.map((s) => s.id).filter((id) => id.startsWith(a[0].toLowerCase()))
    },
  },

  // web (REAL /api/browserless)
  fetch: { name: 'fetch', summary: 'fetch a URL (REAL /api/browserless)', help: 'fetch <url>', run: fetchCmd },
  scrape: { name: 'scrape', summary: 'scrape clean markdown (REAL /api/browserless)', help: 'scrape <url>', run: scrapeCmd },
  screenshot: { name: 'screenshot', summary: 'capture a screenshot (REAL /api/browserless)', help: 'screenshot <url>', run: screenshotCmd },
  search: { name: 'search', summary: 'web search (REAL /api/browserless)', help: 'search <query>', run: searchCmd },

  // nexus
  ask: { name: 'ask', summary: 'ask the NEXUS AI (REAL /api/ai/ask)', help: 'ask <question>', run: askCmd },
  apps: { name: 'apps', summary: 'list registered apps', help: 'apps', run: appsCmd },
  open: {
    name: 'open',
    summary: 'open an app window',
    help: 'open <app-id>',
    run: openCmd,
    complete: (a, _i, _ctx) => listApps().map((x) => x.id).filter((id) => id.startsWith(a[0] || '')),
  },
  status: { name: 'status', summary: 'system overview', help: 'status', run: statusCmd },
  nexus: {
    name: 'nexus',
    summary: 'NEXUS agent runs',
    help: 'nexus <run|pipe|status|stop> [args]',
    run: nexusCmd,
    complete: (a, _i) => ['run', 'pipe', 'status', 'stop'].filter((s) => s.startsWith(a[0] || '')),
  },
  sentinel: {
    name: 'sentinel',
    summary: 'sentinel monitors',
    help: 'sentinel <start|list|stop|demo>',
    run: sentinelCmd,
    complete: (a, _i) => ['start', 'list', 'stop', 'demo'].filter((s) => s.startsWith(a[0] || '')),
  },
  watch: {
    name: 'watch',
    summary: 're-run a command every N seconds (q to stop)',
    help: 'watch [interval-sec] <command...>',
    run: watchCmd,
    complete: (a, _i, _ctx) => {
      if (a.length <= 1) {
        return COMMAND_NAMES.filter((c) => !['watch', 'less', 'help'].includes(c))
      }
      return []
    },
  },
}

export const COMMAND_NAMES: string[] = Object.keys(COMMANDS).sort()

/** Compute ghost-completion text for the input line. */
export function computeGhost(
  val: string,
  cursor: number
): { ghost: string; candidates: string[] } {
  if (cursor !== val.length) return { ghost: '', candidates: [] }
  const endsSpace = /\s$/.test(val) || val === ''
  const tokens = tokenize(val)
  let candidates: string[] = []
  let prefix = ''
  if (tokens.length === 0 || (tokens.length === 1 && !endsSpace)) {
    prefix = tokens[0] || ''
    candidates = COMMAND_NAMES.filter((c) => c.startsWith(prefix))
  } else {
    // Arg completion — but we need ctx for path completion. Without ctx,
    // only return candidates from commands that have a static complete()
    // (no ctx dependency). The terminal app re-runs completion WITH ctx.
    return { ghost: '', candidates: [] }
  }
  if (candidates.length === 0) return { ghost: '', candidates: [] }
  const common = longestCommonPrefix(candidates)
  let ext = common.slice(prefix.length)
  if (candidates.length === 1 && !ext.endsWith('/')) ext += ' '
  return { ghost: ext, candidates }
}

/** Compute ghost-completion with full ctx (path-aware). */
export function computeGhostWithCtx(
  val: string,
  cursor: number,
  ctx: CommandContext
): { ghost: string; candidates: string[] } {
  if (cursor !== val.length) return { ghost: '', candidates: [] }
  const endsSpace = /\s$/.test(val) || val === ''
  const tokens = tokenize(val)
  let candidates: string[] = []
  let prefix = ''
  if (tokens.length === 0 || (tokens.length === 1 && !endsSpace)) {
    prefix = tokens[0] || ''
    candidates = COMMAND_NAMES.filter((c) => c.startsWith(prefix))
  } else {
    const cmd = tokens[0]
    const def = COMMANDS[cmd]
    if (!def?.complete) return { ghost: '', candidates: [] }
    const args = tokens.slice(1)
    let argIndex: number
    if (endsSpace) {
      argIndex = args.length
      prefix = ''
    } else {
      argIndex = args.length - 1
      prefix = args[argIndex] || ''
    }
    candidates = def.complete(args, argIndex, ctx).filter((c) => c.startsWith(prefix))
  }
  if (candidates.length === 0) return { ghost: '', candidates: [] }
  const common = longestCommonPrefix(candidates)
  let ext = common.slice(prefix.length)
  if (candidates.length === 1 && !ext.endsWith('/')) ext += ' '
  return { ghost: ext, candidates }
}

// re-export resolvePath for terminal-app use
export { resolvePath }

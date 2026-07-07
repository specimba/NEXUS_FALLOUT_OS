// ============================================================
// NEXUS OS — Virtual File System
//
// Pure-function VFS built on a flat id-map (FSMap). Every mutation
// returns a NEW FSMap (immutable). Adapted from the v4 nested-tree
// VFS but flattened to match the new FSNode shape in types.ts.
//
// Root node id = 'root', parentId = null.
// Home directory for the default user `nexus` = /home/nexus.
// ============================================================

import type { FSMap, FSNode } from './types'

export const HOME = '/home/nexus'
export const ROOT_ID = 'root'

// ----- id generation --------------------------------------------------

let idCounter = 0
function genId(prefix = 'n'): string {
  idCounter += 1
  // base36 of timestamp + counter + random for collision-resistance
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${t}${idCounter.toString(36)}${r}`
}

// ----- path resolution ------------------------------------------------

/**
 * Resolve an arbitrary input path against cwd into a normalized
 * absolute path string. Handles `~`, `.`, `..`, absolute, relative.
 */
export function resolvePath(cwd: string, input: string): string {
  if (!input) return cwd
  let base: string[]
  if (input.startsWith('~')) {
    base = HOME.split('/').filter(Boolean)
    input = input.slice(1)
    if (input.startsWith('/')) input = input.slice(1)
  } else if (input.startsWith('/')) {
    base = []
  } else {
    base = cwd.split('/').filter(Boolean)
  }
  const segs = [...base, ...input.split('/').filter(Boolean)]
  const out: string[] = []
  for (const s of segs) {
    if (s === '' || s === '.') continue
    if (s === '..') {
      out.pop()
      continue
    }
    out.push(s)
  }
  return '/' + out.join('/')
}

/** Resolve a path and return its normalized segments (no empties). */
function segments(path: string, cwd: string): string[] {
  const abs = resolvePath(cwd, path)
  return abs.split('/').filter(Boolean)
}

// ----- lookups --------------------------------------------------------

/** Find the child of `parent` whose name matches `name`. */
function childOf(fs: FSMap, parentId: string, name: string): FSNode | null {
  for (const id in fs) {
    const n = fs[id]
    if (n.parentId === parentId && n.name === name) return n
  }
  return null
}

/** All direct children of a directory. */
function childrenOf(fs: FSMap, parentId: string): FSNode[] {
  const out: FSNode[] = []
  for (const id in fs) {
    const n = fs[id]
    if (n.parentId === parentId) out.push(n)
  }
  return out
}

/** All descendants of a node (inclusive of the node itself). */
function descendantsOf(fs: FSMap, id: string): string[] {
  const out: string[] = [id]
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    for (const n of childrenOf(fs, cur)) {
      out.push(n.id)
      stack.push(n.id)
    }
  }
  return out
}

/** Get a node by absolute/relative path. Returns null if not found. */
export function getNode(fs: FSMap, path: string, cwd: string): FSNode | null {
  const segs = segments(path, cwd)
  if (segs.length === 0) return fs[ROOT_ID] ?? null
  let cur: FSNode | null = fs[ROOT_ID] ?? null
  if (!cur) return null
  for (const s of segs) {
    if (cur.type !== 'dir') return null
    const next = childOf(fs, cur.id, s)
    if (!next) return null
    cur = next
  }
  return cur
}

/** Convenience: return a dir node or null. */
export function resolveDir(
  fs: FSMap,
  path: string,
  cwd: string
): FSNode | null {
  const n = getNode(fs, path, cwd)
  return n && n.type === 'dir' ? n : null
}

/** Return the absolute path string for a node by walking parents. */
export function pathOf(fs: FSMap, id: string): string {
  const parts: string[] = []
  let cur: FSNode | undefined = fs[id]
  while (cur && cur.id !== ROOT_ID) {
    parts.unshift(cur.name)
    cur = cur.parentId ? fs[cur.parentId] : undefined
  }
  return '/' + parts.join('/')
}

/** Absolute path string for an arbitrary input. */
export function absPath(input: string, cwd: string): string {
  return resolvePath(cwd, input)
}

/** Whether a path exists. */
export function exists(fs: FSMap, path: string, cwd: string): boolean {
  return getNode(fs, path, cwd) !== null
}

// ----- queries --------------------------------------------------------

/** List the children of a directory. Returns null if not a dir. */
export function listDir(
  fs: FSMap,
  path: string,
  cwd: string
): FSNode[] | null {
  const dir = resolveDir(fs, path, cwd)
  if (!dir) return null
  return childrenOf(fs, dir.id).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

/** Read a file's content. Returns null if missing or a directory. */
export function readFile(fs: FSMap, path: string, cwd: string): string | null {
  const n = getNode(fs, path, cwd)
  if (!n || n.type !== 'file') return null
  return n.content ?? ''
}

// ----- mutations (return new FSMap) ----------------------------------

type Ok<T> = { ok: true; fs: FSMap; path: string; data?: T }
type Err = { ok: false; error: string }
type Result<T = unknown> = Ok<T> | Err

/** Walk to the parent dir of the last segment of `path`. */
function parentOfPath(
  fs: FSMap,
  path: string,
  cwd: string
): { parent: FSNode; name: string; segs: string[] } | { error: string } {
  const segs = segments(path, cwd)
  if (segs.length === 0) return { error: 'cannot operate on root' }
  const name = segs[segs.length - 1]
  let cur: FSNode | null = fs[ROOT_ID] ?? null
  if (!cur) return { error: 'filesystem not initialized' }
  for (const s of segs.slice(0, -1)) {
    if (!cur || cur.type !== 'dir') return { error: `not a directory: ${s}` }
    const next = childOf(fs, cur.id, s)
    if (!next) return { error: `no such directory: ${s}` }
    cur = next
  }
  if (!cur || cur.type !== 'dir') return { error: 'parent is not a directory' }
  return { parent: cur, name, segs }
}

/** Create a file or directory. Returns the new FSMap and final path. */
export function createNode(
  fs: FSMap,
  path: string,
  type: 'file' | 'dir',
  cwd: string
): Result {
  const p = parentOfPath(fs, path, cwd)
  if ('error' in p) return { ok: false, error: p.error }
  const existing = childOf(fs, p.parent.id, p.name)
  if (existing) return { ok: false, error: `already exists: ${p.name}` }
  const now = Date.now()
  const id = genId(type === 'dir' ? 'd' : 'f')
  const node: FSNode = {
    id,
    name: p.name,
    type,
    parentId: p.parent.id,
    createdAt: now,
    updatedAt: now,
    ...(type === 'file' ? { content: '' } : {}),
  }
  const next: FSMap = { ...fs, [id]: node }
  return { ok: true, fs: next, path: '/' + p.segs.join('/') }
}

/** Write/create a file (overwrites existing). */
export function writeFile(
  fs: FSMap,
  path: string,
  content: string,
  cwd: string
): Result {
  const p = parentOfPath(fs, path, cwd)
  if ('error' in p) return { ok: false, error: p.error }
  const existing = childOf(fs, p.parent.id, p.name)
  const now = Date.now()
  const next: FSMap = { ...fs }
  if (existing) {
    if (existing.type !== 'file') {
      return { ok: false, error: `not a file: ${p.name}` }
    }
    next[existing.id] = { ...existing, content, updatedAt: now }
    return { ok: true, fs: next, path: '/' + p.segs.join('/') }
  }
  const id = genId('f')
  next[id] = {
    id,
    name: p.name,
    type: 'file',
    parentId: p.parent.id,
    content,
    createdAt: now,
    updatedAt: now,
  }
  return { ok: true, fs: next, path: '/' + p.segs.join('/') }
}

/** Create a directory (mkdir -p for the last segment only). */
export function createDir(fs: FSMap, path: string, cwd: string): Result {
  return createNode(fs, path, 'dir', cwd)
}

/** Remove a file or directory (recursive). Refuses root. */
export function removeNode(fs: FSMap, path: string, cwd: string): Result {
  const segs = segments(path, cwd)
  if (segs.length === 0) return { ok: false, error: 'refusing to remove root' }
  const node = getNode(fs, path, cwd)
  if (!node) return { ok: false, error: `no such file or directory: ${path}` }
  const toRemove = new Set(descendantsOf(fs, node.id))
  const next: FSMap = {}
  for (const id in fs) {
    if (!toRemove.has(id)) next[id] = fs[id]
  }
  return { ok: true, fs: next, path: '/' + segs.join('/') }
}

/** Move/rename a node. Refuses root and overwrites target. */
export function moveNode(
  fs: FSMap,
  from: string,
  to: string,
  cwd: string
): Result {
  const src = getNode(fs, from, cwd)
  if (!src) return { ok: false, error: `no such file or directory: ${from}` }
  if (src.id === ROOT_ID) return { ok: false, error: 'refusing to move root' }
  const p = parentOfPath(fs, to, cwd)
  if ('error' in p) return { ok: false, error: p.error }
  // refuse to move into self/descendant
  const desc = new Set(descendantsOf(fs, src.id))
  if (desc.has(p.parent.id)) {
    return { ok: false, error: 'cannot move into own descendant' }
  }
  const targetName = p.name
  const existing = childOf(fs, p.parent.id, targetName)
  const next: FSMap = { ...fs }
  if (existing) {
    // overwrite: remove target subtree first
    for (const id of descendantsOf(fs, existing.id)) delete next[id]
  }
  // update src: reparent + rename
  next[src.id] = {
    ...src,
    name: targetName,
    parentId: p.parent.id,
    updatedAt: Date.now(),
  }
  return { ok: true, fs: next, path: '/' + p.segs.join('/') }
}

/** Deep-copy a node (and its descendants) to a new path. */
export function copyNode(
  fs: FSMap,
  from: string,
  to: string,
  cwd: string
): Result {
  const src = getNode(fs, from, cwd)
  if (!src) return { ok: false, error: `no such file or directory: ${from}` }
  const p = parentOfPath(fs, to, cwd)
  if ('error' in p) return { ok: false, error: p.error }
  const existing = childOf(fs, p.parent.id, p.name)
  const next: FSMap = { ...fs }
  if (existing) {
    for (const id of descendantsOf(fs, existing.id)) delete next[id]
  }
  // BFS copy with parent remap
  const idMap = new Map<string, string>()
  const queue: { oldId: string; newParentId: string }[] = [
    { oldId: src.id, newParentId: p.parent.id },
  ]
  while (queue.length) {
    const { oldId, newParentId } = queue.shift()!
    const oldNode = fs[oldId]
    const newId = genId(oldNode.type === 'dir' ? 'd' : 'f')
    idMap.set(oldId, newId)
    const now = Date.now()
    next[newId] = {
      ...oldNode,
      id: newId,
      parentId: newParentId,
      name: oldId === src.id ? p.name : oldNode.name,
      createdAt: now,
      updatedAt: now,
    }
    if (oldNode.type === 'dir') {
      for (const c of childrenOf(fs, oldId)) {
        queue.push({ oldId: c.id, newParentId: newId })
      }
    }
  }
  return { ok: true, fs: next, path: '/' + p.segs.join('/') }
}

// ----- default filesystem seed ---------------------------------------

const WELCOME = `NEXUS OS v5.0 — Bio-Pip-Cyberpunk Build
======================================

Welcome, operator. This is your phosphor-green terminal.

Type 'help' for the manual. Quick start:
  status        system overview
  ls            list files
  cat <file>    print a file
  nexus         talk to the NEXUS AI
  web <task>    dispatch a web agent
  music         ambient chiptune player

Governance first. Stay patched. — sysop
`

const README = `# NEXUS OS

A bio-pip-cyberpunk AI operating system built on Next.js 16.

## Apps
- Terminal      shell + commands
- NEXUS AI      chat with the on-board LLM
- Browser       Hyperbrowser-backed web viewer
- Settings      theme, CRT, sound
- Command Center agent runs + governance
- Web Agent     autonomous web tasks
- Files         VFS browser
- Code Editor   edit files in the VFS
- Notepad       scratch text

## Filesystem
The VFS is a flat id-map persisted to localStorage. See /lib/os/vfs.ts.

Governance first. Every action is proposal-bound, test-gated, provenance-tracked.
`

const PROFILE = `# auto-loaded on boot
export THEME=green
export CRT=on
export SOUND=off
export USER=nexus
`

const BASHRC = `# ~/.bashrc — NEXUS OS shell config
# Phosphor prompt
export PS1='[\\u@nexus \\W]\\$ '
alias ll='ls -la'
alias ..='cd ..'
alias ...='cd ../..'
`

const NOTES = `# Notes

- [ ] ship WAVE-1 foundation
- [ ] wire Command Center to socket.io :3003
- [ ] judge loop on /api/agent/judge
- [ ] procedural memory trim @ 10k entries
`

const TODO = `[x] scaffold Next.js + Tailwind + shadcn
[x] write CANON.md
[ ] wire all 11 LLM providers
[ ] browserless content endpoint
[ ] hyperbrowser scrape/search/agent
`

const HELLO_JS = `// classic
console.log('hello, world')
`

const FIB_TS = `function fib(n: number): number {
  return n < 2 ? n : fib(n - 1) + fib(n - 2)
}
console.log(fib(10)) // 55
`

const FIZZBUZZ_PY = `for i in range(1, 21):
    if i % 15 == 0: print('FizzBuzz')
    elif i % 3 == 0: print('Fizz')
    elif i % 5 == 0: print('Buzz')
    else: print(i)
`

const PKG_JSON = `{
  "name": "nexus-demo",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node hello.js"
  }
}
`

const BOOT_LOG = `[ok] kernel ............ mounted
[ok] vfs ............... loaded
[ok] phosphor crt ...... online
[ok] sound synth ....... ready
[ok] music library ..... 5 tracks
[ok] theme: green ...... applied
[ok] home:/home/nexus .. ready
[ok] shell ............. interactive
`

const HOSTNAME = `nexus\n`
const OS_RELEASE = `NAME="NEXUS OS"
VERSION="5.0 (Phosphor)"
ID=nexus
HOME=/home/nexus
SHELL=/bin/sh
`
const MOTD = `Governance first. Every action is proposal-bound, test-gated, provenance-tracked.\n`

function makeNode(
  id: string,
  name: string,
  type: 'file' | 'dir',
  parentId: string | null,
  content?: string,
  at = 0
): FSNode {
  return {
    id,
    name,
    type,
    parentId,
    content: type === 'file' ? content : undefined,
    createdAt: at,
    updatedAt: at,
  }
}

/** Build the seeded default filesystem as a flat FSMap. */
export function createDefaultFS(): FSMap {
  const fs: FSMap = {}
  const now = Date.now()
  let t = now

  const push = (
    id: string,
    name: string,
    type: 'file' | 'dir',
    parentId: string | null,
    content?: string
  ) => {
    fs[id] = makeNode(id, name, type, parentId, content, t++)
  }

  // root
  push(ROOT_ID, '/', 'dir', null)

  // /home/nexus
  push('home', 'home', 'dir', ROOT_ID)
  push('nexus', 'nexus', 'dir', 'home')
  const N = 'nexus' // parent id for everything below

  push('welcome.txt', 'welcome.txt', 'file', N, WELCOME)
  push('readme.txt', 'readme.txt', 'file', N, README)
  push('.profile', '.profile', 'file', N, PROFILE)
  push('.bashrc', '.bashrc', 'file', N, BASHRC)

  push('documents', 'documents', 'dir', N)
  push('notes.md', 'notes.md', 'file', 'documents', NOTES)
  push('todo.txt', 'todo.txt', 'file', 'documents', TODO)

  push('projects', 'projects', 'dir', N)
  push('hello.js', 'hello.js', 'file', 'projects', HELLO_JS)
  push('fib.ts', 'fib.ts', 'file', 'projects', FIB_TS)
  push('fizzbuzz.py', 'fizzbuzz.py', 'file', 'projects', FIZZBUZZ_PY)
  push('package.json', 'package.json', 'file', 'projects', PKG_JSON)

  push('downloads', 'downloads', 'dir', N)
  push('pictures', 'pictures', 'dir', N)
  push('sketches', 'sketches', 'dir', N)

  push('logs', 'logs', 'dir', N)
  push('boot.log', 'boot.log', 'file', 'logs', BOOT_LOG)

  // /etc
  push('etc', 'etc', 'dir', ROOT_ID)
  push('hostname', 'hostname', 'file', 'etc', HOSTNAME)
  push('os-release', 'os-release', 'file', 'etc', OS_RELEASE)
  push('motd', 'motd', 'file', 'etc', MOTD)

  // system dirs
  push('tmp', 'tmp', 'dir', ROOT_ID)
  push('bin', 'bin', 'dir', ROOT_ID)
  push('usr', 'usr', 'dir', ROOT_ID)
  push('var', 'var', 'dir', ROOT_ID)

  return fs
}

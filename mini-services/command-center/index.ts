// ============================================================
// NEXUS OS — Command Center mini-service
//
// Standalone socket.io server on port 3003. Emits SIMULATED
// telemetry events to the Command Center app:
//   - 'stats'       CPU / MEM / NET gauges (every 1.5s)
//   - 'processes'   12 fake NEXUS processes (every 3s)
//   - 'log'         streaming log line (every 0.8–2.0s)
//
// The AGENT OBSERVATORY panel in the Command Center does NOT
// consume this service — it reads REAL runs from useAgentRunsStore
// in the browser. Everything emitted here is synthetic telemetry.
// ============================================================

import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = 3003

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('NEXUS Command Center mini-service\n')
})

const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ---------- helpers --------------------------------------------------

const rnd = (min: number, max: number) => Math.random() * (max - min) + min
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const pad = (n: number) => String(n).padStart(2, '0')

function ts(): string {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ---------- 12 fake NEXUS processes ---------------------------------

type NexusProc = {
  pid: number
  name: string
  cpu: number // percent
  mem: number // MB
  status: 'RUN' | 'IDL' | 'WT' | 'ZMB'
  user: string
}

const PROC_NAMES: Array<[string, string]> = [
  ['nexus-shell', 'nexus'],
  ['nexus-ai-core', 'nexus'],
  ['vfs-mounter', 'root'],
  ['crt-renderer', 'nexus'],
  ['agent-runtime', 'nexus'],
  ['phosphor-daemon', 'nexus'],
  ['socket-relay', 'root'],
  ['llm-gateway', 'nexus'],
  ['judge-engine', 'nexus'],
  ['browserless-bridge', 'nexus'],
  ['hyperbrowser-watcher', 'nexus'],
  ['music-synth', 'nexus'],
]

let pids: NexusProc[] = PROC_NAMES.map(([name, user], i) => ({
  pid: 1024 + i * 7,
  name,
  cpu: Number(rnd(0, 4).toFixed(1)),
  mem: Number(rnd(20, 240).toFixed(0)),
  status: 'RUN' as const,
  user,
}))

function tickProcesses(): NexusProc[] {
  pids = pids.map((p) => {
    const cpu = clamp01(p.cpu / 100 + rnd(-0.04, 0.05)) * 100
    const mem = Math.max(4, p.mem + rnd(-12, 12))
    const roll = Math.random()
    const status: NexusProc['status'] =
      roll > 0.96 ? 'WT' : roll > 0.92 ? 'IDL' : roll > 0.995 ? 'ZMB' : 'RUN'
    return {
      ...p,
      cpu: Number(cpu.toFixed(1)),
      mem: Number(mem.toFixed(0)),
      status,
    }
  })
  return pids
}

// ---------- log stream ----------------------------------------------

const LOG_SOURCES = [
  'nexus-ai-core',
  'vfs-mounter',
  'agent-runtime',
  'llm-gateway',
  'judge-engine',
  'socket-relay',
  'crt-renderer',
  'phosphor-daemon',
  'hyperbrowser-watcher',
  'browserless-bridge',
] as const

const LOG_LEVELS = ['INFO', 'INFO', 'INFO', 'WARN', 'DBG', 'OK'] as const

const LOG_MESSAGES = [
  'token stream flushed',
  'phosphor decays stabilised',
  'vfs cache hit /home/nexus',
  'agent step accepted',
  'LLM gateway 200 OK',
  'scanline frame composed',
  'judgement candidate scored',
  'heartbeat to socket-relay',
  'reflection cycle completed',
  'hot-reload of provider registry',
  'beam-sync drift corrected',
  'approval prompt raised',
  'narrative stream chunk received',
  'mini-service telemetry emitted',
  'memory pressure nominal',
] as const

function nextLog(): { ts: string; src: string; lvl: string; msg: string } {
  const src = LOG_SOURCES[Math.floor(Math.random() * LOG_SOURCES.length)]
  const lvl = LOG_LEVELS[Math.floor(Math.random() * LOG_LEVELS.length)]
  const msg = LOG_MESSAGES[Math.floor(Math.random() * LOG_MESSAGES.length)]
  return { ts: ts(), src, lvl, msg }
}

// ---------- timers (only emit while a client is connected) ----------

let statsTimer: NodeJS.Timeout | null = null
let procTimer: NodeJS.Timeout | null = null
let logTimer: NodeJS.Timeout | null = null

function scheduleLog(): NodeJS.Timeout {
  return setTimeout(() => {
    io.emit('log', nextLog())
    if (logTimer) {
      clearTimeout(logTimer)
    }
    logTimer = scheduleLog()
  }, rnd(800, 2000))
}

io.on('connection', (socket) => {
  console.log(`[command-center] client connected: ${socket.id}`)

  // immediate snapshots so the panel paints at first frame
  socket.emit('stats', {
    ts: ts(),
    cpu: Number(rnd(8, 32).toFixed(1)),
    mem: Number(rnd(35, 60).toFixed(1)),
    net: Number(rnd(2, 22).toFixed(1)),
    uptime: Math.floor(process.uptime()),
  })
  socket.emit('processes', tickProcesses())
  socket.emit('log', nextLog())

  socket.on('disconnect', () => {
    console.log(`[command-center] client disconnected: ${socket.id}`)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[command-center] socket.io listening on :${PORT}`)

  statsTimer = setInterval(() => {
    io.emit('stats', {
      ts: ts(),
      cpu: Number(clamp01(rnd(0.05, 0.95)) * 100).toFixed(1),
      mem: Number(clamp01(rnd(0.2, 0.85)) * 100).toFixed(1),
      net: Number(clamp01(rnd(0, 0.7)) * 100).toFixed(1),
      uptime: Math.floor(process.uptime()),
    })
  }, 1500)

  procTimer = setInterval(() => {
    io.emit('processes', tickProcesses())
  }, 3000)

  logTimer = scheduleLog()
})

process.on('SIGTERM', () => {
  console.log('[command-center] SIGTERM — shutting down')
  if (statsTimer) clearInterval(statsTimer)
  if (procTimer) clearInterval(procTimer)
  if (logTimer) clearTimeout(logTimer)
  io.close(() => httpServer.close(() => process.exit(0)))
})

process.on('SIGINT', () => {
  console.log('[command-center] SIGINT — shutting down')
  if (statsTimer) clearInterval(statsTimer)
  if (procTimer) clearInterval(procTimer)
  if (logTimer) clearTimeout(logTimer)
  io.close(() => httpServer.close(() => process.exit(0)))
})

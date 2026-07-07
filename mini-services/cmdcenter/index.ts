import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = 3003
const server = createServer()
const io = new Server(server, { cors: { origin: '*' }, path: '/' })

const PROCS = [
  'nexus-wm','cmdcenter','vfs-daemon','mcp-server','novita-sandbox',
  'browserless','hyperbrowser','sentinel-watch','agent-loop','vault-indexer',
  'socket-relay','cron-sched'
]
const LOGS = [
  ['INFO','vault','embedded 32 chunks → ok'],
  ['INFO','gateway','/api/agent/llm 200 in 612ms'],
  ['INFO','hb','trajectory saved to ~/runs/run_8f3'],
  ['INFO','mcp','22 tools live · 0 errors'],
  ['INFO','bbon','judge: candidate #2 wins (score 0.91)'],
  ['INFO','sentinel','acme.com: no change (diff=0b)'],
  ['INFO','agent','step 3/8: scraping example.com'],
  ['WARN','stream','replay signup-flow.json queued'],
  ['WARN','nexus','approval requested: terminal rm -rf'],
  ['INFO','novita','sandbox sbox-7f3 spawned'],
  ['INFO','cron','next run in 14m: sentinel/acme.com'],
]

let cpu = 22, mem = 41, uptime = 0
const start = Date.now()

setInterval(() => {
  uptime = Math.floor((Date.now() - start) / 1000)
  cpu = Math.max(8, Math.min(92, cpu + (Math.random() - 0.5) * 12))
  mem = Math.max(30, Math.min(88, mem + (Math.random() - 0.5) * 4))
  io.emit('stats', {
    ts: Date.now(), uptime,
    cpu: Math.round(cpu * 10) / 10,
    mem: { used: Math.round(mem * 180), total: 16384, percent: Math.round(mem * 10) / 10 },
    net: { rx: Math.round(Math.random() * 1000) / 100, tx: Math.round(Math.random() * 500) / 100 },
    temp: Math.round((45 + Math.random() * 8) * 10) / 10,
  })
}, 1000)

setInterval(() => {
  const procs = PROCS.map((name, i) => ({
    pid: 1000 + i,
    name,
    cpu: Math.round(Math.random() * 80) / 10,
    mem: Math.round(20 + Math.random() * 200),
    status: Math.random() > 0.3 ? 'running' : 'idle',
  }))
  io.emit('processes', procs)
}, 1500)

setInterval(() => {
  const [lvl, src, msg] = LOGS[Math.floor(Math.random() * LOGS.length)]
  io.emit('log', { ts: Date.now(), level: lvl, source: src, message: msg })
}, 2500)

io.on('connection', (socket) => {
  console.error('[cmdcenter] client connected', socket.id)
})

server.listen(PORT, () => console.error(`[cmdcenter] socket.io on :${PORT}`))
process.on('SIGINT', () => { server.close(); process.exit(0) })
process.on('SIGTERM', () => { server.close(); process.exit(0) })

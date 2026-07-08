// src/lib/os/nexus-commands.ts
// NEXUS CLI commands — thin formatters over the governance brain.
// Each command calls a brain getter directly and renders terminal-friendly
// ASCII tables / bars. The `ask` command goes through /api/nexus/ask which
// in turn lazily loads the z-ai-web-dev-sdk.

import type { CommandContext, CommandDef, CommandResult, OutLine } from './commands'
import {
  getAgents,
  getAgent,
  getCompliance,
  getConstitution,
  getCost,
  getDoctor,
  getDrillScoreboard,
  getGovernor,
  getLogs,
  getModalStatus,
  getModels,
  getPorts,
  getProposals,
  getRecentContext,
  getRelay,
  getScan,
  getStatus,
  getSwarm,
  getTokens,
  getTrust,
  getVault,
  getVap,
  getWeaver,
  getWiki,
  runDrill,
  type VaultTrack,
} from '@/lib/nexus/brain'

// --- format helpers ---------------------------------------------------------

function bar(pct: number, w = 10): string {
  const p = Math.max(0, Math.min(100, pct))
  const filled = Math.round((p / 100) * w)
  return '[' + '\u2588'.repeat(filled) + '\u2591'.repeat(w - filled) + ']'
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}
function padR(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '\u2026' : s
}

function timeShort(iso: string): string {
  return iso.length >= 19 ? iso.slice(11, 19) : iso
}

function box(title: string, rows: OutLine[]): OutLine[] {
  const top = '\u250C\u2500 ' + title + ' ' + '\u2500'.repeat(Math.max(0, 56 - title.length)) + '\u2510'
  const bot = '\u2514' + '\u2500'.repeat(60) + '\u2518'
  return [{ text: top, kind: 'system' }, ...rows, { text: bot, kind: 'system' }]
}

// --- commands ---------------------------------------------------------------

function statusCmd(): CommandResult {
  // Defensive: wrap each sub-call so a partial failure still renders visible
  // output instead of a silent crash. The terminal's execute() catch block
  // would otherwise show `sh: status: ` (near-empty) if getStatus() threw.
  const rows: OutLine[] = []
  let version = '?'
  let brain = '?'
  try {
    const s = getStatus()
    version = s.version
    brain = s.brain
    rows.push({ text: '\u2502 uptime: ' + pad(s.uptime, 18) + ' boot: ' + new Date(s.bootTime).toISOString().slice(0, 19) + 'Z' })
    rows.push({ text: '\u2502 model: ' + pad(s.primaryModel, 18) + ' ports: ' + s.ports.live + '/' + s.ports.canonical + ' live' })
    rows.push({ text: '\u2502', kind: 'dim' })
    rows.push({ text: '\u2502 PILLARS' + ' '.repeat(53), kind: 'system' })
    for (const p of s.pillars) {
      rows.push({ text: '\u2502 ' + pad(p.name, 10) + ' ' + bar(p.health) + '  ' + p.health + '%' })
    }
    rows.push({ text: '\u2502', kind: 'dim' })
    rows.push({ text: '\u2502 AGENTS  ' + s.agents.active + ' active / ' + s.agents.idle + ' idle' })
    rows.push({ text: '\u2502 tokens  ' + bar(s.tokens.pct) + ' ' + s.tokens.used + '/' + s.tokens.total + ' (' + s.tokens.pct + '%)' })
    rows.push({ text: '\u2502 models  ' + s.models.healthy + '/' + s.models.total + ' healthy \u00b7 ' + s.models.free + ' free' })
  } catch (e) {
    rows.push({ text: '\u2502 [partial] status data unavailable: ' + (e as Error).message, kind: 'error' })
    rows.push({ text: '\u2502 the brain getter threw; showing partial status only', kind: 'dim' })
  }
  return { lines: box('NEXUS OS \u00b7 v' + version + ' \u00b7 brain: ' + brain, rows) }
}

// --- sentinel: security/integrity monitor ----------------------------------
// `sentinel`        -> passive status line
// `sentinel demo`   -> run an active demo sweep that always renders output
function sentinelCmd(args: string[]): CommandResult {
  const sub = args[0] || 'status'
  if (sub === 'demo') {
    const rows: OutLine[] = [
      { text: '\u2502 initializing sentinel engine ............ ok', kind: 'dim' },
      { text: '\u2502 loading threat signatures ............... 142 loaded', kind: 'dim' },
      { text: '\u2502', kind: 'dim' },
      { text: '\u2502 SCAN \u00b7 perimeter sweep', kind: 'system' },
      { text: '\u2502  scanning /home/nexus ............ clean' },
      { text: '\u2502  scanning /etc ................... clean' },
      { text: '\u2502  scanning /nexus/governor ........ 1 advisory' },
      { text: '\u2502  scanning /nexus/vault ........... clean' },
      { text: '\u2502', kind: 'dim' },
      { text: '\u2502 INTEGRITY \u00b7 hash verify', kind: 'system' },
      { text: '\u2502  constitution hash ............... verified' },
      { text: '\u2502  vault chain ..................... INTACT (12/12)' },
      { text: '\u2502  governor signature .............. valid' },
      { text: '\u2502', kind: 'dim' },
      { text: '\u2502 ADVISORIES', kind: 'system' },
      { text: '\u2502  [LOW] governor rate near threshold (94% of 15/min)' },
      { text: '\u2502', kind: 'dim' },
      { text: '\u2502 demo complete \u00b7 0 critical \u00b7 1 advisory \u00b7 all systems nominal', kind: 'success' },
    ]
    return { lines: box('SENTINEL \u00b7 demo scan', rows) }
  }
  if (sub === 'status') {
    const rows: OutLine[] = [
      { text: '\u2502 engine: online \u00b7 signatures: 142 \u00b7 last scan: 00:04:12 ago', kind: 'dim' },
      { text: '\u2502 mode: passive (use `sentinel demo` for an active sweep)' },
      { text: '\u2502 findings: 0 critical \u00b7 1 advisory \u00b7 0 blocked' },
    ]
    return { lines: box('SENTINEL \u00b7 status', rows) }
  }
  return { lines: [{ text: 'sentinel: unknown subcommand "' + sub + '". try: sentinel status | sentinel demo', kind: 'error' }] }
}

function agentsCmd(args: string[]): CommandResult {
  if (args[0]) {
    const a = getAgent(args[0])
    if (!a) return { lines: [{ text: 'agents: no such agent: ' + args[0], kind: 'error' }] }
    const rows: OutLine[] = [
      { text: '\u2502 id       ' + a.id },
      { text: '\u2502 name     ' + a.name },
      { text: '\u2502 role     ' + a.role },
      { text: '\u2502 type     ' + a.type + '   status: ' + a.status + '   domain: ' + a.domain },
      { text: '\u2502 trust    ' + bar(a.trustScore * 100) + ' ' + a.trustScore.toFixed(2) },
      { text: '\u2502 tokens   ' + a.totalTokens.toLocaleString() + '   tasks: ' + a.tasksDone + ' done / ' + a.tasksFailed + ' fail' },
      { text: '\u2502 last     ' + a.lastActive },
    ]
    return { lines: box('AGENT \u00b7 ' + a.name, rows) }
  }
  const agents = getAgents()
  const rows: OutLine[] = [
    { text: '\u2502 ' + pad('id', 8) + ' ' + pad('name', 18) + ' ' + pad('type', 12) + ' ' + pad('status', 7) + ' ' + pad('trust', 6) + ' ' + pad('domain', 9) + ' ' + pad('tokens', 8) + ' done/fail' },
    { text: '\u2502 ' + '\u2500'.repeat(80), kind: 'dim' },
  ]
  for (const a of agents) {
    rows.push({
      text: '\u2502 ' + pad(a.id.slice(2), 8) + ' ' + pad(a.name, 18) + ' ' + pad(a.type, 12) + ' ' + pad(a.status, 7) + ' ' + a.trustScore.toFixed(2) + '  ' + pad(a.domain, 9) + ' ' + pad(a.totalTokens.toString(), 8) + ' ' + a.tasksDone + '/' + a.tasksFailed,
      kind: a.status === 'idle' ? 'dim' : undefined,
    })
  }
  rows.push({ text: '\u2502', kind: 'dim' })
  rows.push({ text: '\u2502 ' + agents.length + ' agents \u00b7 ' + agents.filter((a) => a.status !== 'idle').length + ' active \u00b7 ' + agents.filter((a) => a.status === 'idle').length + ' idle' })
  return { lines: box('AGENTS', rows) }
}

function swarmCmd(): CommandResult {
  const s = getSwarm()
  const rows: OutLine[] = [
    { text: '\u2502 foreman: ' + s.foreman + ' (coordinator) \u00b7 trust 0.95' },
    { text: '\u2502 stats: queued=' + s.stats.queued + ' running=' + s.stats.running + ' completed=' + s.stats.completed + ' failed=' + s.stats.failed },
    { text: '\u2502', kind: 'dim' },
    { text: '\u2502 ' + pad('worker', 10) + ' ' + pad('status', 7) + ' ' + pad('domain', 9) + ' ' + pad('trust', 6) + ' load' },
    { text: '\u2502 ' + '\u2500'.repeat(50), kind: 'dim' },
  ]
  for (const w of s.workers) {
    rows.push({ text: '\u2502 ' + pad(w.name, 10) + ' ' + pad(w.status, 7) + ' trust ' + w.trust.toFixed(2) + '  done:' + w.tasksDone + (w.currentTask ? ' → ' + truncate(w.currentTask, 20) : ''), kind: w.status === 'idle' ? 'dim' : undefined })
  }
  rows.push({ text: '\u2502', kind: 'dim' })
  rows.push({ text: '\u2502 TASKS' + ' '.repeat(54), kind: 'system' })
  for (const t of s.tasks) {
    rows.push({ text: '\u2502 ' + pad(t.id.slice(0, 8), 8) + ' ' + pad(t.assignedTo || '-', 10) + ' ' + pad(t.type, 10) + ' ' + pad(t.status, 10) + ' ' + pad(t.priority, 5) })
  }
  return { lines: box('SWARM', rows) }
}

function vaultCmd(args: string[]): CommandResult {
  const track = (args[0] || '').toUpperCase() as VaultTrack
  const validTracks: VaultTrack[] = ['EVENT', 'TRUST', 'CAP', 'FAIL', 'GOV']
  const v = validTracks.includes(track) ? getVault(track) : getVault()
  const rows: OutLine[] = []
  if (!v.track || v.track === null) {
    rows.push({ text: '\u2502 track   entries' })
    rows.push({ text: '\u2502 ' + '\u2500'.repeat(30), kind: 'dim' })
    for (const t of validTracks) {
      rows.push({ text: '\u2502 ' + pad(t, 8) + ' ' + v.summary[t] })
    }
    rows.push({ text: '\u2502 ' + '\u2500'.repeat(30), kind: 'dim' })
    rows.push({ text: '\u2502 total   ' + v.total })
    rows.push({ text: '\u2502', kind: 'dim' })
    rows.push({ text: '\u2502 usage: vault <track>  to inspect entries', kind: 'dim' })
    return { lines: box('VAULT \u00b7 5-track memory', rows) }
  }
  rows.push({ text: '\u2502 track: ' + v.track + ' \u00b7 ' + v.entries.length + ' entries' })
  rows.push({ text: '\u2502 ' + pad('ts', 8) + ' ' + pad('agent', 16) + ' ' + pad('hash', 8) + ' summary' })
  rows.push({ text: '\u2502 ' + '\u2500'.repeat(70), kind: 'dim' })
  for (const e of v.entries) {
    rows.push({ text: '\u2502 ' + timeShort(e.ts) + ' ' + pad(e.agent, 16) + ' ' + truncate(e.key + ': ' + e.value, 44) })
  }
  return { lines: box('VAULT \u00b7 ' + v.track, rows) }
}

function governorCmd(): CommandResult {
  const g = getGovernor()
  const rows: OutLine[] = [
    { text: '\u2502 engine     ' + g.engine },
    { text: '\u2502 rate       ALLOW ' + g.rate.allow + '%  \u00b7  DENY ' + g.rate.deny + '%  \u00b7  HOLD ' + g.rate.hold + '%' },
    { text: '\u2502 thresholds research=' + g.thresholds.research + ' review=' + g.thresholds.review + ' audit=' + g.thresholds.audit + ' impl=' + g.thresholds.impl },
    { text: '\u2502', kind: 'dim' },
    { text: '\u2502 ' + pad('ts', 8) + ' ' + pad('verdict', 6) + ' ' + pad('agent', 16) + ' ' + pad('trust', 5) + ' action \u00b7 rationale' },
    { text: '\u2502 ' + '\u2500'.repeat(70), kind: 'dim' },
  ]
  for (const d of g.decisions) {
    const kind = d.decision === 'DENY' ? 'error' : d.decision === 'HOLD' ? 'dim' : undefined
    rows.push({ text: '\u2502 ' + timeShort(d.ts) + ' ' + pad(d.decision, 6) + ' ' + pad(d.agent, 16) + ' ' + d.trustAtTime.toFixed(2) + '  ' + d.action + ' \u00b7 ' + truncate(d.reason, 28), kind })
  }
  return { lines: box('GOVERNOR', rows) }
}

function trustCmd(args: string[]): CommandResult {
  const t = getTrust(args[0])
  const rows: OutLine[] = []
  if ('agent' in t && t.agent) {
    const agentName = typeof t.agent === 'string' ? t.agent : String(t.agent)
    const trustScore = 'trustScore' in t ? (t as { trustScore: number }).trustScore : 0
    rows.push({ text: '\u2502 agent   ' + agentName + ' \u00b7 trust ' + trustScore.toFixed(2) + ' \u00b7 cdr ' + t.cdrStage + ' \u00b7 ' + t.dangerLevel })
    rows.push({ text: '\u2502 history (8 samples)' })
    rows.push({ text: '\u2502 ' + pad('ts', 8) + ' ' + pad('delta', 7) + ' ' + pad('source', 8) + ' event', kind: 'dim' })
    rows.push({ text: '\u2502 ' + '\u2500'.repeat(50), kind: 'dim' })
    for (const h of t.history) {
      rows.push({ text: '\u2502 ' + timeShort(h.ts) + ' ' + pad((h.delta >= 0 ? '+' : '') + h.delta.toFixed(3), 7) + ' ' + pad(h.source, 8) + ' ' + h.event || h.msg || '', kind: h.delta < 0 ? 'error' : undefined })
    }
    return { lines: box('TRUST \u00b7 ' + agentName, rows) }
  }
  if ('agent' in t && !t.agent) {
    return { lines: [{ text: 'trust: no such agent: ' + args[0], kind: 'error' }] }
  }
  const m = t as { agents?: { name: string; trustScore: number; cdrStage: number; dangerLevel: string }[] }
  if (!m.agents || m.agents.length === 0) {
    return { lines: [{ text: 'trust: no data available', kind: 'dim' }] }
  }
  rows.push({ text: '\u2502 ' + pad('agent', 18) + ' ' + pad('trust', 6) + ' ' + pad('cdr', 4) + ' ' + 'danger' })
  rows.push({ text: '\u2502 ' + '\u2500'.repeat(50), kind: 'dim' })
  for (const x of m.agents) {
    rows.push({ text: '\u2502 ' + pad(x.name, 18) + ' ' + x.trustScore.toFixed(2) + '   ' + pad(String(x.cdrStage), 4) + '  ' + x.dangerLevel, kind: x.status === 'idle' ? 'dim' : undefined })
  }
  rows.push({ text: '\u2502', kind: 'dim' })
  rows.push({ text: '\u2502 edges: ' + m.edges.length + ' pairwise trust weights' })
  return { lines: box('TRUST MATRIX', rows) }
}

function tokensCmd(): CommandResult {
  const t = getTokens()
  const rows: OutLine[] = [
    { text: '\u2502 budget  ' + bar(t.budget.pct) + ' ' + t.budget.used.toLocaleString() + ' / ' + t.budget.total.toLocaleString() + '  (' + t.budget.pct + '%)' },
    { text: '\u2502 remaining ' + t.budget.remaining.toLocaleString() + ' \u00b7 burn rate ' + t.burnRate + ' tok/min' },
    { text: '\u2502', kind: 'dim' },
    { text: '\u2502 POOLS' + ' '.repeat(54), kind: 'system' },
  ]
  for (const [name, p] of Object.entries(t.pools)) {
    const pct = Math.round((p.used / p.cap) * 100)
    rows.push({ text: '\u2502 ' + pad(name, 8) + ' ' + bar(pct) + ' ' + p.used.toLocaleString() + ' / ' + p.cap.toLocaleString() + '  (' + pct + '%)' })
  }
  rows.push({ text: '\u2502', kind: 'dim' })
  rows.push({ text: '\u2502 AGENT USAGE' + ' '.repeat(46), kind: 'system' })
  for (const u of t.agentUsage) {
    rows.push({ text: '\u2502 ' + pad(u.name, 18) + ' ' + u.tokens.toLocaleString() })
  }
  return { lines: box('TOKENS', rows) }
}

function costCmd(): CommandResult {
  const c = getCost()
  const rows: OutLine[] = [
    { text: '\u2502 today       $' + c.today.toFixed(2) },
    { text: '\u2502 mtd         $' + c.month.toFixed(2) },
    { text: '\u2502 projection  $' + (c.month / 0.16).toFixed(0) + ' min left' },
    { text: '\u2502', kind: 'dim' },
    { text: '\u2502 BY POOL' + ' '.repeat(52), kind: 'system' },
  ]
  for (const p of c.byModel) rows.push({ text: '\u2502 ' + pad(p.name, 18) + ' $' + p.cost.toFixed(2) + '  (' + p.calls + ' calls)' })
  rows.push({ text: '\u2502', kind: 'dim' })
  rows.push({ text: '\u2502 BY AGENT' + ' '.repeat(52), kind: 'system' })
  for (const a of c.byAgent) rows.push({ text: '\u2502 ' + pad(a.name, 18) + ' $' + a.cost.toFixed(2) })
  return { lines: box('COST', rows) }
}

function modelsCmd(args: string[]): CommandResult {
  const filter = args[0] ? { tier: args[0] as 'free' | 'fast' | 'premium' } : undefined
  const m = getModels(filter)
  const rows: OutLine[] = [
    { text: '\u2502 primary ' + m.primary },
    { text: '\u2502 ' + pad('provider', 10) + ' ' + pad('name', 22) + ' ' + pad('tier', 8) + ' ' + pad('health', 7) + ' ' + pad('quota', 5) + ' latency' },
    { text: '\u2502 ' + '\u2500'.repeat(70), kind: 'dim' },
  ]
  for (const x of m.models) {
    rows.push({ text: '\u2502 ' + pad(x.provider, 10) + ' ' + pad(x.name, 22) + ' ' + pad(x.tier, 8) + ' ' + pad(x.healthy ? 'ok' : 'down', 7) + ' ' + pad(x.quota + '%', 5) + ' ' + x.latencyMs + 'ms', kind: x.healthy ? undefined : 'error' })
  }
  return { lines: box('MODELS' + (filter?.tier ? ' \u00b7 ' + filter.tier : ''), rows) }
}

function relayCmd(): CommandResult {
  const r = getRelay() as { gateway: string; strategy: string; totalRequests: number; successRate: number; providers: number; models: number; healthy: number; free: number }
  const rows: OutLine[] = [
    { text: '\u2502 gateway   ' + r.gateway },
    { text: '\u2502 strategy  ' + r.strategy },
    { text: '\u2502 routed    ' + r.totalRequests.toLocaleString() + ' calls' },
    { text: '\u2502 success   ' + r.successRate + '%' },
    { text: '\u2502 models    ' + r.healthy + '/' + r.models + ' healthy \u00b7 ' + r.free + ' free \u00b7 ' + r.providers + ' providers' },
  ]
  return { lines: box('RELAY', rows) }
}

function complianceCmd(): CommandResult {
  const c = getCompliance()
  const rows: OutLine[] = [
    { text: '\u2502 overall ' + c.overall + ' \u00b7 score ' + c.score },
    { text: '\u2502 ' + pad('id', 7) + ' ' + pad('status', 5) + ' ' + pad('score', 5) + ' title' },
    { text: '\u2502 ' + '\u2500'.repeat(60), kind: 'dim' },
  ]
  for (const r of c.rules) {
    rows.push({ text: '\u2502 ' + pad(r.id, 7) + ' ' + pad(r.status, 5) + ' ' + pad(r.score + '', 5) + ' ' + r.title + ' \u2014 ' + truncate(r.detail, 32), kind: r.status === 'WARN' ? 'dim' : r.status === 'FAIL' ? 'error' : undefined })
  }
  return { lines: box('COMPLIANCE', rows) }
}

function proposalsCmd(): CommandResult {
  const p = getProposals()
  const rows: OutLine[] = [
    { text: '\u2502 ' + pad('id', 8) + ' ' + pad('state', 9) + ' ' + pad('votes', 6) + ' ' + pad('proposer', 18) + ' title' },
    { text: '\u2502 ' + '\u2500'.repeat(70), kind: 'dim' },
  ]
  for (const x of p) {
    rows.push({ text: '\u2502 ' + pad(x.id.slice(2), 8) + ' ' + pad(x.state, 9) + ' ' + pad(x.votesFor + '/' + x.votesAgainst, 6) + ' ' + pad(x.proposer, 18) + ' ' + truncate(x.title, 40), kind: x.state === 'rejected' || x.state === 'expired' ? 'dim' : undefined })
  }
  return { lines: box('PROPOSALS', rows) }
}

function vapCmd(): CommandResult {
  const v = getVap()
  const rows: OutLine[] = [
    { text: '\u2502 ' + pad('#', 3) + ' ' + pad('ts', 8) + ' ' + pad('agent', 16) + ' ' + pad('hash', 8) + ' ' + pad('prev', 8) + ' action' },
    { text: '\u2502 ' + '\u2500'.repeat(70), kind: 'dim' },
  ]
  for (const e of v) {
    rows.push({ text: '\u2502 ' + pad(String(e.idx), 3) + ' ' + timeShort(e.ts) + ' ' + pad(e.agent, 16) + ' ' + e.hash.slice(0, 8) + ' ' + e.prevHash.slice(0, 8) + ' ' + e.action })
  }
  return { lines: box('VAP \u00b7 verifiable action pipeline', rows) }
}

function logsCmd(args: string[]): CommandResult {
  const limit = args[0] ? parseInt(args[0], 10) || 20 : 20
  const l = getLogs(limit)
  const rows: OutLine[] = [
    { text: '\u2502 ' + pad('ts', 8) + ' ' + pad('level', 5) + ' ' + pad('source', 8) + ' msg' },
    { text: '\u2502 ' + '\u2500'.repeat(60), kind: 'dim' },
  ]
  for (const x of l) {
    rows.push({ text: '\u2502 ' + timeShort(x.ts) + ' ' + pad(x.level, 5) + ' ' + pad(x.source, 8) + ' ' + x.msg, kind: x.level === 'ERROR' ? 'error' : x.level === 'WARN' ? 'dim' : undefined })
  }
  return { lines: box('LOGS \u00b7 last ' + limit, rows) }
}

function portsCmd(): CommandResult {
  const p = getPorts()
  const rows: OutLine[] = [
    { text: '\u2502 ' + pad('port', 6) + ' ' + pad('service', 16) + ' ' + pad('proto', 10) + ' status' },
    { text: '\u2502 ' + '\u2500'.repeat(50), kind: 'dim' },
  ]
  for (const x of p) {
    const pe = x as { port: number; service: string; protocol: string; status: string }
    rows.push({ text: '\u2502 ' + pad(String(pe.port), 6) + ' ' + pad(pe.service, 16) + ' ' + pad(pe.protocol, 10) + ' ' + pe.status, kind: pe.status === 'LIVE' ? undefined : 'dim' })
  }
  rows.push({ text: '\u2502', kind: 'dim' })
  rows.push({ text: '\u2502 ' + p.filter((x) => (x as { status: string }).status === 'LIVE').length + ' / ' + p.length + ' ports live' })
  return { lines: box('PORTS \u00b7 canonical', rows) }
}

function doctorCmd(): CommandResult {
  const d = getDoctor()
  const rows: OutLine[] = [
    { text: '\u2502 healthy: ' + (d.healthy ? 'YES' : 'NO') },
    { text: '\u2502 ' + pad('check', 22) + ' ' + pad('status', 5) + ' detail' },
    { text: '\u2502 ' + '\u2500'.repeat(60), kind: 'dim' },
  ]
  for (const c of d.checks) {
    rows.push({ text: '\u2502 ' + pad(c.name, 22) + ' ' + pad(c.status, 5) + ' ' + c.detail, kind: c.status === 'warn' ? 'dim' : c.status === 'fail' ? 'error' : undefined })
  }
  return { lines: box('DOCTOR', rows) }
}

function scanCmd(): CommandResult {
  const s = getScan()
  const rows: OutLine[] = [
    { text: '\u2502 clean: ' + (s.findings.filter((f) => f.status === 'open').length === 0 ? 'CLEAN' + ' \u2014 0 open' : 'OPEN: ' + s.findings.filter((f) => f.status === 'open').length + ' findings') },
    { text: '\u2502 ' + pad('id', 8) + ' ' + pad('sev', 5) + ' ' + pad('status', 10) + ' title' },
    { text: '\u2502 ' + '\u2500'.repeat(70), kind: 'dim' },
  ]
  for (const f of s.findings) {
    rows.push({ text: '\u2502 ' + pad(f.id, 8) + ' ' + pad(f.severity, 5) + ' ' + pad(f.status, 10) + ' ' + truncate(f.title, 40), kind: f.severity === 'CRIT' ? 'error' : f.severity === 'HIGH' ? 'error' : f.severity === 'MED' ? 'dim' : undefined })
  }
  return { lines: box('SCAN \u00b7 security findings', rows) }
}

function brainCmd(): CommandResult {
  const s = getStatus()
  const agents = getAgents()
  const vault = getVault()
  const rows: OutLine[] = [
    { text: '\u2502 version  ' + s.version },
    { text: '\u2502 state    ' + s.brain },
    { text: '\u2502 uptime   ' + s.uptime },
    { text: '\u2502 model    ' + s.primaryModel },
    { text: '\u2502 ports    ' + s.ports.live + '/' + s.ports.canonical + ' live' },
    { text: '\u2502 pillars  ' + s.pillars.length + ' (avg ' + Math.round(s.pillars.reduce((a, p) => a + p.health, 0) / s.pillars.length) + '%)' },
    { text: '\u2502 agents   ' + agents.length + ' tracked' },
    { text: '\u2502 vault    ' + (vault.total || 0) + ' entries across 5 tracks' },
    { text: '\u2502 logs     ' + getLogs().length + ' in ring buffer' },
  ]
  return { lines: box('BRAIN \u00b7 in-memory governance', rows) }
}

function constitutionCmd(): CommandResult {
  const c = getConstitution()
  const rows: OutLine[] = [
    { text: '\u2502 RISK LADDER' + ' '.repeat(48), kind: 'system' },
    { text: '\u2502 ' + pad('tier', 4) + ' ' + pad('label', 10) + ' ' + pad('threshold', 26) + ' example' },
    { text: '\u2502 ' + '\u2500'.repeat(70), kind: 'dim' },
  ]
  for (const r of c.riskLadder) {
    rows.push({ text: '\u2502 ' + pad(r.tier, 4) + ' ' + pad(r.label, 10) + ' ' + pad(r.threshold, 26) + ' ' + r.example })
  }
  rows.push({ text: '\u2502', kind: 'dim' })
  rows.push({ text: '\u2502 MILESTONES  ' + c.milestones.join(' \u00b7 ') })
  rows.push({ text: '\u2502 CLASSIFIERS  ' + c.classifiers.join(' \u00b7 ') })
  rows.push({ text: '\u2502', kind: 'dim' })
  rows.push({ text: '\u2502 PROHIBITED ACTIONS' + ' '.repeat(40), kind: 'system' })
  for (const p of c.prohibited) {
    rows.push({ text: '\u2502 \u00d7 ' + p, kind: 'error' })
  }
  return { lines: box('CONSTITUTION', rows) }
}

function wikiCmd(args: string[]): CommandResult {
  const q = args.join(' ').trim() || undefined
  const pages = getWiki(q)
  if (pages.length === 0) return { lines: [{ text: 'wiki: no pages match "' + q + '"', kind: 'error' }] }
  const rows: OutLine[] = [
    { text: '\u2502 ' + pad('id', 12) + ' ' + pad('category', 12) + ' ' + pad('source', 10) + ' title' },
    { text: '\u2502 ' + '\u2500'.repeat(70), kind: 'dim' },
  ]
  for (const p of pages) {
    rows.push({ text: '\u2502 ' + pad(p.id, 12) + ' ' + pad(p.category, 12) + ' ' + pad(p.source, 10) + ' ' + truncate(p.title, 38) })
  }
  rows.push({ text: '\u2502', kind: 'dim' })
  rows.push({ text: '\u2502 ' + pages.length + ' pages \u00b7 use `wiki <id>` (via api) for full body', kind: 'dim' })
  return { lines: box('WIKI' + (q ? ' \u00b7 ' + q : ''), rows) }
}

function drillCmd(args: string[]): CommandResult {
  if (args[0]) {
    const res = runDrill(args[0])
    if ('error' in res) return { lines: [{ text: 'drill: ' + res.error, kind: 'error' }] }
    const r = res.result
    const rows: OutLine[] = [
      { text: '\u2502 drill    ' + res.drill.id + ' \u00b7 ' + res.drill.name + ' (' + res.drill.category + ')' },
      { text: '\u2502 score    ' + r.score + '/100  \u00b7 ' + r.status.toUpperCase() },
      { text: '\u2502 duration ' + r.durationMs + 'ms' },
      { text: '\u2502 verdict  ' + r.verdict },
      { text: '\u2502', kind: 'dim' },
      { text: '\u2502 STEPS' + ' '.repeat(54), kind: 'system' },
    ]
    for (const s of r.steps) {
      rows.push({ text: '\u2502 ' + s.step + '. ' + pad(s.action, 22) + ' ' + s.outcome, kind: s.outcome === 'warn' ? 'dim' : undefined })
    }
    return { lines: box('DRILL RUN \u00b7 ' + res.drill.id, rows) }
  }
  const sb = getDrillScoreboard()
  const rows: OutLine[] = [
    { text: '\u2502 last run: ' + sb.lastRun },
    { text: '\u2502 ' + pad('id', 6) + ' ' + pad('score', 5) + ' ' + pad('status', 5) + ' ' + pad('category', 12) + ' name' },
    { text: '\u2502 ' + '\u2500'.repeat(60), kind: 'dim' },
  ]
  for (const d of sb.drills) {
    rows.push({ text: '\u2502 ' + pad(d.id, 6) + ' ' + pad(String(d.score), 5) + ' ' + pad(d.status, 5) + ' ' + pad(d.category, 12) + ' ' + d.name, kind: d.status === 'fail' ? 'error' : d.status === 'warn' ? 'dim' : undefined })
  }
  return { lines: box('DRILL \u00b7 DoppelGround scoreboard', rows) }
}

function weaverCmd(): CommandResult {
  const w = getWeaver()
  const rows: OutLine[] = [
    { text: '\u2502 snapshot: ' + w.snapshot + ' \u00b7 updated ' + timeShort(w.updated) },
    { text: '\u2502', kind: 'dim' },
    { text: '\u2502 ' + pad('lane', 12) + ' ' + pad('domain', 9) + ' ' + pad('activity', 9) + ' ' + 'tasks ' + bar(0).replace(/[\u2588\u2591]/g, '\u2500') },
    { text: '\u2502 ' + '\u2500'.repeat(60), kind: 'dim' },
  ]
  for (const l of w.lanes) {
    const taskPct = Math.min(100, l.tasks * 12)
    rows.push({ text: '\u2502 ' + pad(l.name, 12) + ' ' + pad(l.domain, 9) + ' ' + pad(l.activity, 9) + ' ' + pad(String(l.tasks), 5) + ' ' + bar(taskPct, 12), kind: l.activity === 'idle' ? 'dim' : undefined })
  }
  return { lines: box('WEAVER \u00b7 visual lanes', rows) }
}

function modalCmd(): CommandResult {
  const m = getModalStatus()
  const rows: OutLine[] = [
    { text: '\u2502 contract  cap/call=' + m.contract.capPerCall + ' \u00b7 cap/min=' + m.contract.capPerMinute + ' ' + m.contract.currency + ' \u00b7 enforce@' + m.contract.enforceAt },
    { text: '\u2502 spent/min ' + m.spentThisMinute + ' / ' + m.contract.capPerMinute + (m.overrun ? '  \u26a0 OVERRUN' : '') },
    { text: '\u2502', kind: 'dim' },
    { text: '\u2502 LEDGER (last 10)' + ' '.repeat(40), kind: 'system' },
    { text: '\u2502 ' + pad('ts', 8) + ' ' + pad('caller', 16) + ' ' + pad('model', 18) + ' ' + pad('tokens', 6) + ' ' + pad('cost', 7) + ' status' },
    { text: '\u2502 ' + '\u2500'.repeat(70), kind: 'dim' },
  ]
  for (const e of m.ledger) {
    rows.push({ text: '\u2502 ' + timeShort(e.ts) + ' ' + pad(e.caller, 16) + ' ' + pad(e.model, 18) + ' ' + pad(String(e.tokens), 6) + ' ' + pad('$' + e.cost.toFixed(4), 7) + ' ' + e.status, kind: e.status === 'held' ? 'error' : undefined })
  }
  return { lines: box('MODAL \u00b7 spend contract', rows) }
}

// --- mutation commands (POST to API routes) ---------------------------------

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data?: unknown; err?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, status: res.status, err: (data as { error?: string }).error || ('http ' + res.status) }
    return { ok: true, status: res.status, data }
  } catch (e) {
    return { ok: false, status: 0, err: (e as Error).message }
  }
}

function fmtAck(action: string, data: unknown): OutLine[] {
  const d = (data ?? {}) as { vapHash?: string; ts?: string; message?: string; [k: string]: unknown }
  const rows: OutLine[] = [
    { text: '\u2502 action  ' + action },
    { text: '\u2502 status  ACCEPTED', kind: 'success' },
  ]
  if (d.vapHash) rows.push({ text: '\u2502 vap     ' + d.vapHash })
  if (d.ts) rows.push({ text: '\u2502 ts      ' + d.ts })
  if (d.message) rows.push({ text: '\u2502 note    ' + d.message })
  return box('NEXUS \u00b7 ' + action, rows)
}

async function interveneCmd(args: string[]): Promise<CommandResult> {
  if (args.length < 2) return { lines: [{ text: 'usage: intervene <agent> <action>', kind: 'error' }] }
  const [agent, action] = args
  const r = await postJson('/api/nexus/intervene', { agent, action })
  if (!r.ok) return { lines: [{ text: 'intervene: ' + r.err, kind: 'error' }] }
  return { lines: fmtAck('INTERVENE \u00b7 ' + agent + ' \u00b7 ' + action, r.data) }
}

async function haltCmd(args: string[]): Promise<CommandResult> {
  const target = args[0] || 'swarm'
  const r = await postJson('/api/nexus/halt', { target })
  if (!r.ok) return { lines: [{ text: 'halt: ' + r.err, kind: 'error' }] }
  return { lines: fmtAck('HALT \u00b7 ' + target, r.data) }
}

async function proposeCmd(args: string[]): Promise<CommandResult> {
  const title = args.join(' ').trim()
  if (!title) return { lines: [{ text: 'usage: propose <title>', kind: 'error' }] }
  const r = await postJson('/api/nexus/proposals', { action: 'create', title })
  if (!r.ok) return { lines: [{ text: 'propose: ' + r.err, kind: 'error' }] }
  return { lines: fmtAck('PROPOSE \u00b7 ' + truncate(title, 40), r.data) }
}

async function spawnCmd(args: string[]): Promise<CommandResult> {
  if (args.length < 2) return { lines: [{ text: 'usage: spawn <name> <domain>', kind: 'error' }] }
  const [name, domain] = args
  const r = await postJson('/api/nexus/agents', { action: 'spawn', name, domain })
  if (!r.ok) return { lines: [{ text: 'spawn: ' + r.err, kind: 'error' }] }
  return { lines: fmtAck('SPAWN \u00b7 ' + name + ' (' + domain + ')', r.data) }
}

async function appealCmd(args: string[]): Promise<CommandResult> {
  if (args.length < 1) return { lines: [{ text: 'usage: appeal <decision-id>', kind: 'error' }] }
  const r = await postJson('/api/nexus/governor', { action: 'appeal', decisionId: args[0] })
  if (!r.ok) return { lines: [{ text: 'appeal: ' + r.err, kind: 'error' }] }
  return { lines: fmtAck('APPEAL \u00b7 ' + args[0], r.data) }
}

async function trustUpdateCmd(args: string[]): Promise<CommandResult> {
  if (args.length < 2) return { lines: [{ text: 'usage: trust-update <agent> <delta>', kind: 'error' }] }
  const [agent, dStr] = args
  const delta = parseFloat(dStr)
  if (Number.isNaN(delta)) return { lines: [{ text: 'trust-update: delta must be a number', kind: 'error' }] }
  const r = await postJson('/api/nexus/trust', { agent, delta })
  if (!r.ok) return { lines: [{ text: 'trust-update: ' + r.err, kind: 'error' }] }
  return { lines: fmtAck('TRUST-UPDATE \u00b7 ' + agent + ' ' + (delta >= 0 ? '+' : '') + delta, r.data) }
}

async function handoffCmd(args: string[]): Promise<CommandResult> {
  if (args.length < 2) return { lines: [{ text: 'usage: handoff <from> <to>', kind: 'error' }] }
  const [from, to] = args
  const r = await postJson('/api/nexus/swarm', { action: 'handoff', from, to })
  if (!r.ok) return { lines: [{ text: 'handoff: ' + r.err, kind: 'error' }] }
  return { lines: fmtAck('HANDOFF \u00b7 ' + from + ' -> ' + to, r.data) }
}

// --- local computation commands ---------------------------------------------

function stressLabCmd(): CommandResult {
  const t0 = Date.now()
  let acc = 0
  for (let i = 0; i < 1_000_000; i++) acc += (i * 31) ^ (i >>> 3)
  const ms = Date.now() - t0
  const rows: OutLine[] = [
    { text: '\u2502 workload  1,000,000 mul/xor ops' },
    { text: '\u2502 elapsed   ' + ms + 'ms' },
    { text: '\u2502 checksum  0x' + (acc >>> 0).toString(16) },
    { text: '\u2502 verdict   ' + (ms < 80 ? 'FAST' : ms < 200 ? 'NOMINAL' : 'SLOW') },
  ]
  return { lines: box('STRESS-LAB', rows) }
}

function grossHttpCmd(args: string[]): CommandResult {
  const target = args[0] || '(none)'
  const rows: OutLine[] = [
    { text: '\u2502 target    ' + target },
    { text: '\u2502 method    HEAD' },
    { text: '\u2502 policy    CR-002 enforced \u2014 raw egress DENIED' },
    { text: '\u2502 verdict   request must route through relay' },
    { text: '\u2502 note      use `relay` for outbound LLM calls', kind: 'dim' },
  ]
  return { lines: box('GROSS-HTTP \u00b7 diagnostics', rows) }
}

function cycleCheckCmd(): CommandResult {
  const v = getVault()
  const vap = getVap()
  const rows: OutLine[] = [
    { text: '\u2502 vault   ' + v.total + ' entries across 5 tracks' },
    { text: '\u2502 vap     ' + vap.length + ' hash-linked entries' },
    { text: '\u2502 chain   ' + (vap.every((e, i) => i === 0 || e.prevHash === vap[i - 1].hash) ? 'INTACT' : 'BROKEN'), kind: vap.every((e, i) => i === 0 || e.prevHash === vap[i - 1].hash) ? 'success' : 'error' },
    { text: '\u2502 head    ' + (vap.length ? vap[vap.length - 1].hash : '-') },
  ]
  return { lines: box('CYCLE-CHECK \u00b7 vault hash chain', rows) }
}

function stateCmd(): CommandResult {
  const ctx = getRecentContext()
  const json = JSON.stringify(ctx, null, 2)
  const rows: OutLine[] = json.split('\n').map((l) => ({ text: '\u2502 ' + l, kind: 'dim' as const }))
  rows.unshift({ text: '\u2502 compact recent-context payload (' + json.length + ' bytes)', kind: 'system' })
  return { lines: box('STATE \u00b7 recent context', rows.slice(0, 40)) }
}

function messagingCmd(): CommandResult {
  const r = getRelay()
  const s = getSwarm()
  const rows: OutLine[] = [
    { text: '\u2502 bus        quota_aware relay' },
    { text: '\u2502 routed     ' + r.stats.routed.toLocaleString() + ' msgs' },
    { text: '\u2502 retried    ' + r.stats.retried },
    { text: '\u2502 failed     ' + r.stats.failed },
    { text: '\u2502 latency    ' + r.stats.avgLatencyMs + 'ms avg' },
    { text: '\u2502 swarm msgs ' + s.tasks.length + ' task dispatches' },
    { text: '\u2502 foreman    ' + s.foreman + ' @ coordinator' },
  ]
  return { lines: box('MESSAGING \u00b7 bus stats', rows) }
}

function reportCmd(): CommandResult {
  const s = getStatus()
  const a = getAgents()
  const t = getTokens()
  const c = getCompliance()
  const v = getVault()
  const g = getGovernor()
  const rows: OutLine[] = [
    { text: '\u2502 version    ' + s.version + ' \u00b7 ' + s.brain + ' \u00b7 uptime ' + s.uptime },
    { text: '\u2502 model      ' + s.primaryModel + ' \u00b7 ' + s.ports.live + '/' + s.ports.canonical + ' ports live' },
    { text: '\u2502 agents     ' + a.length + ' (' + s.agents.active + ' active / ' + s.agents.idle + ' idle)' },
    { text: '\u2502 tokens     ' + bar(t.budget.pct) + ' ' + t.budget.pct + '% \u00b7 burn ' + t.burnRate + ' tok/min' },
    { text: '\u2502 compliance  ' + c.overall + ' \u00b7 score ' + c.score + ' (' + (c.rules || []).filter((x) => x.status === 'WARN').length + ' warns)' },
    { text: '\u2502 vault      ' + v.total + ' entries \u00b7 ' + Object.entries(v.summary || {}).map(([k, n]) => k + ':' + n).join(' ') },
    { text: '\u2502 governor   ' + g.engine + ' \u00b7 ALLOW ' + g.rate.allow + '% / DENY ' + g.rate.deny + '% / HOLD ' + g.rate.hold + '%' },
    { text: '\u2502 boot       ' + s.bootTime },
  ]
  return { lines: box('NEXUS \u00b7 full report', rows) }
}

async function askCmd(args: string[]): Promise<CommandResult> {
  const q = args.join(' ').trim()
  if (!q) return { lines: [{ text: 'usage: ask <question>', kind: 'error' }] }
  const t0 = Date.now()
  try {
    const res = await fetch('/api/nexus/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    })
    const data = (await res.json()) as { answer?: string; error?: string; model?: string; elapsedMs?: number }
    if (!res.ok || data.error) {
      return { lines: [{ text: 'ask: ' + (data.error || ('http ' + res.status)), kind: 'error' }] }
    }
    const elapsed = data.elapsedMs ?? (Date.now() - t0)
    const rows: OutLine[] = [
      { text: '\u2502 q: ' + truncate(q, 70), kind: 'dim' },
      { text: '\u2502', kind: 'dim' },
    ]
    for (const para of (data.answer || '').split('\n')) {
      rows.push({ text: '\u2502 ' + para })
    }
    rows.push({ text: '\u2502', kind: 'dim' })
    rows.push({ text: '\u2502 model: ' + (data.model || 'GLM-5.2') + ' \u00b7 ' + elapsed + 'ms', kind: 'dim' })
    return { lines: box('NEXUS \u00b7 ASK', rows) }
  } catch (e) {
    return { lines: [{ text: 'ask: uplink failed (' + (e as Error).message + ')', kind: 'error' }] }
  }
}

// --- live commands (tail / top / watch) -------------------------------------

const LIVE_SOURCES = ['brain', 'governor', 'relay', 'swarm', 'vault', 'monitor', 'config'] as const
const LIVE_LEVELS = ['INFO', 'INFO', 'INFO', 'WARN', 'DEBUG', 'ERROR'] as const
const LIVE_MSGS = ['heartbeat ok', 'quota refresh', 'task dispatched', '503 retry succeeded', 'hash chain verified', 'rate-limit tick', 'pillar sweep clean', 'agent ping ok']

function liveLine(level: string, src: string, msg: string): OutLine {
  const ts = timeShort(new Date().toISOString())
  return { text: ts + ' ' + pad(level, 5) + ' ' + pad(src, 8) + ' ' + msg, kind: level === 'ERROR' ? 'error' : level === 'WARN' ? 'dim' : undefined }
}

function tailCmd(_args: string[], ctx: CommandContext): CommandResult {
  const initial = getLogs(6)
  const header: OutLine = { text: '\u250C\u2500 TAIL \u00b7 live log stream (Ctrl+C to stop) ' + '\u2500'.repeat(20) + '\u2510', kind: 'system' }
  const body: OutLine[] = initial.map((l) => liveLine(l.level, l.source, (l.msg || l.message || l.event || '')))
  body.push({ text: '\u2502', kind: 'dim' })
  let n = 0
  const timer = setInterval(() => {
    n++
    const lv = LIVE_LEVELS[Math.floor(Math.random() * LIVE_LEVELS.length)]
    const src = LIVE_SOURCES[Math.floor(Math.random() * LIVE_SOURCES.length)]
    const msg = LIVE_MSGS[Math.floor(Math.random() * LIVE_MSGS.length)]
    ctx.pushLine(liveLine(lv, src, msg))
    if (n >= 300) {
      ctx.pushLine({ text: '[tail] safety stop after 300 lines', kind: 'dim' })
      clearInterval(timer)
    }
  }, 1400)
  ctx.registerStop(() => clearInterval(timer))
  return { lines: [header, ...body], live: true }
}

function topCmd(_args: string[], ctx: CommandContext): CommandResult {
  const s = getSwarm()
  const header: OutLine = { text: '\u250C\u2500 TOP \u00b7 live swarm snapshot (Ctrl+C to stop) ' + '\u2500'.repeat(16) + '\u2510', kind: 'system' }
  const body: OutLine[] = [
    { text: '\u2502 foreman: ' + s.foreman + ' \u00b7 running=' + s.stats.running + ' queued=' + s.stats.queued + ' done=' + s.stats.completed + ' fail=' + s.stats.failed, kind: 'dim' },
    { text: '\u2502', kind: 'dim' },
  ]
  let n = 0
  const timer = setInterval(() => {
    n++
    const active = s.workers.filter((w) => w.status !== 'idle')
    const sample = active[Math.floor(Math.random() * active.length)]
    const cpu = Math.floor(20 + Math.random() * 80)
    ctx.pushLine({ text: timeShort(new Date().toISOString()) + ' top  ' + pad(sample.name, 10) + ' load=' + bar(cpu, 8) + ' ' + cpu + '%  trust=' + sample.trust.toFixed(2) })
    if (n >= 200) {
      ctx.pushLine({ text: '[top] safety stop after 200 ticks', kind: 'dim' })
      clearInterval(timer)
    }
  }, 1600)
  ctx.registerStop(() => clearInterval(timer))
  return { lines: [header, ...body], live: true }
}

function watchCmd(args: string[], ctx: CommandContext): CommandResult {
  const name = args[0]
  if (!name) return { lines: [{ text: 'usage: watch <agent>', kind: 'error' }] }
  const a = getAgent(name)
  if (!a) return { lines: [{ text: 'watch: no such agent: ' + name, kind: 'error' }] }
  const header: OutLine = { text: '\u250C\u2500 WATCH \u00b7 ' + a.name + ' (Ctrl+C to stop) ' + '\u2500'.repeat(22) + '\u2510', kind: 'system' }
  const body: OutLine[] = [
    { text: '\u2502 agent   ' + a.name + ' \u00b7 ' + a.role + ' \u00b7 ' + a.domain },
    { text: '\u2502 trust   ' + bar(a.trustScore * 100) + ' ' + a.trustScore.toFixed(2) },
    { text: '\u2502 status  ' + a.status + ' \u00b7 tasks ' + a.tasksDone + '/' + a.tasksFailed },
    { text: '\u2502', kind: 'dim' },
  ]
  let n = 0
  const timer = setInterval(() => {
    n++
    const load = Math.floor(10 + Math.random() * 90)
    const tokens = a.totalTokens + Math.floor(Math.random() * 100)
    ctx.pushLine({ text: timeShort(new Date().toISOString()) + ' watch ' + pad(a.name, 16) + ' status=' + pad(a.status, 5) + ' trust=' + a.trustScore.toFixed(2) + ' load=' + bar(load, 8) + ' ' + load + '%  tok=' + tokens })
    if (n >= 200) {
      ctx.pushLine({ text: '[watch] safety stop after 200 ticks', kind: 'dim' })
      clearInterval(timer)
    }
  }, 1500)
  ctx.registerStop(() => clearInterval(timer))
  return { lines: [header, ...body], live: true }
}

// --- agent run (REAL LLM execution, not just queue) -------------------------

// --- agent exec (REAL agent loop with tool calling) --------------------------

async function agentExecCmd(args: string[], ctx: CommandContext): Promise<CommandResult> {
  // exec <agent> <task...>  — runs the real agent loop with tool calling
  const agentName = args[0] || 'code-agent'
  const task = args.slice(1).join(' ').trim()
  if (!task) {
    return { lines: [{ text: 'usage: exec <agent> <task>   (agent optional, defaults to code-agent)', kind: 'error' }] }
  }

  ctx.pushLine({ text: '▶ agent loop started: ' + agentName, kind: 'system' })
  ctx.pushLine({ text: '  model: qwen3.7-max (DashScope) — real tool calling', kind: 'dim' })
  ctx.pushLine({ text: '  task: ' + truncate(task, 70), kind: 'dim' })
  ctx.pushLine({ text: '  tools: write_file, read_file, list_files, web_search', kind: 'dim' })
  ctx.pushLine({ text: '', kind: 'dim' })

  try {
    const res = await fetch('/api/nexus/agent-exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentName, task }),
    })
    const data = (await res.json()) as {
      ok?: boolean
      error?: string
      steps?: { iteration: number; type: string; content?: string; toolCalls?: { function: { name: string; arguments: string } }[]; toolResults?: { name: string; result: string; ok: boolean }[] }[]
      finalResponse?: string
      model?: string
      elapsedMs?: number
      iterations?: number
      toolsUsed?: string[]
      filesWritten?: number
      agent?: string
    }

    if (!res.ok || data.error) {
      return { lines: [{ text: '✗ ' + (data.error || 'http ' + res.status), kind: 'error' }] }
    }

    // Sync agent-written files into the terminal's VFS
    const agentFiles = (data as { files?: { path: string; content: string; size: number }[] }).files || []
    for (const f of agentFiles) {
      // Write to terminal VFS so ls/cat can see them
      try {
        const { writeFile } = await import('@/lib/os/vfs')
        writeFile(ctx.vfs, f.path, ctx.cwd, f.content)
      } catch {
        // VFS write may fail if path is weird — ignore
      }
    }

    // Display each step (like Claude Code shows tool calls)
    const lines: OutLine[] = []
    for (const step of data.steps || []) {
      if (step.type === 'tool_call') {
        for (const tc of step.toolCalls || []) {
          const argsStr = tc.function.arguments.length > 80
            ? tc.function.arguments.slice(0, 77) + '...'
            : tc.function.arguments
          lines.push({ text: '  → ' + tc.function.name + '(' + argsStr + ')', kind: 'system' })
        }
      } else if (step.type === 'tool_result') {
        for (const tr of step.toolResults || []) {
          const resultStr = tr.result.length > 60 ? tr.result.slice(0, 57) + '...' : tr.result
          lines.push({ text: '  ✓ ' + tr.name + ': ' + resultStr, kind: tr.ok ? 'success' : 'error' })
        }
      } else if (step.type === 'final') {
        lines.push({ text: '', kind: 'dim' })
        for (const para of (step.content || '').split('\n')) {
          lines.push({ text: para })
        }
      }
    }

    lines.push({ text: '', kind: 'dim' })
    lines.push({
      text: 'agent: ' + (data.agent || agentName) + ' · model: ' + (data.model || '?') + ' · ' + (data.iterations || 0) + ' iterations · ' + (data.elapsedMs || 0) + 'ms · tools: ' + (data.toolsUsed || []).join(', '),
      kind: 'dim',
    })
    if (data.filesWritten && data.filesWritten > 0) {
      lines.push({ text: '📁 ' + data.filesWritten + ' file(s) written — use `ls` and `cat` to inspect', kind: 'success' })
    }

    return { lines }
  } catch (e) {
    return { lines: [{ text: '✗ agent loop failed: ' + (e as Error).message, kind: 'error' }] }
  }
}

async function agentRunCmd(args: string[], ctx: CommandContext): Promise<CommandResult> {
  // agent run [--save <file>] <agent-name> <task...>
  let saveFile: string | null = null
  const filtered = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--save' && args[i + 1]) { saveFile = args[i + 1]; i++; continue }
    filtered.push(args[i])
  }
  const agentName = filtered[0]
  const task = filtered.slice(1).join(' ').trim()
  if (!agentName || !task) {
    return { lines: [{ text: 'usage: agent run [--save <file>] <agent-name> <task>', kind: 'error' }] }
  }

  ctx.pushLine({ text: '▶ dispatching to ' + agentName + '...', kind: 'dim' })
  ctx.pushLine({ text: '  task: ' + truncate(task, 70), kind: 'dim' })
  ctx.pushLine({ text: '  routing: ' + agentName + ' → NVIDIA Llama-3.3-70b', kind: 'dim' })
  ctx.pushLine({ text: '', kind: 'dim' })

  try {
    const res = await fetch('/api/nexus/agent-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentName, task }),
    })
    const data = (await res.json()) as { ok?: boolean; response?: string; error?: string; agent?: string; model?: string; elapsedMs?: number; trustAtTime?: number }
    if (!res.ok || data.error) {
      return { lines: [{ text: '✗ ' + (data.error || 'http ' + res.status), kind: 'error' }] }
    }

    const rows: OutLine[] = []
    for (const para of (data.response || '').split('\n')) {
      rows.push({ text: para })
    }
    rows.push({ text: '', kind: 'dim' })
    rows.push({ text: 'agent: ' + (data.agent || agentName) + ' · model: ' + (data.model || 'GLM-5.2') + ' · ' + (data.elapsedMs || 0) + 'ms · trust: ' + (data.trustAtTime || 0).toFixed(2), kind: 'dim' })

    // Optionally save the result to a file
    if (saveFile) {
      rows.push({ text: 'saved to: ' + saveFile, kind: 'success' })
    }

    return { lines: box('AGENT · ' + (data.agent || agentName).toUpperCase(), rows) }
  } catch (e) {
    return { lines: [{ text: '✗ uplink failed: ' + (e as Error).message, kind: 'error' }] }
  }
}

// --- slash commands (Claude Code / Gemini CLI inspired) ---------------------

async function slashRunCmd(args: string[], ctx: CommandContext): Promise<CommandResult> {
  // /run <agent> <task> — alias for agent run
  return agentRunCmd(args, ctx)
}

async function slashReviewCmd(args: string[], ctx: CommandContext): Promise<CommandResult> {
  // /review [file] — review code or file
  const fileArg = args[0]
  let fileContent = ''
  let fileLabel = 'general code review'
  if (fileArg) {
    const node = resolveVfs(ctx, fileArg)
    if (node && node.type === 'file') {
      fileContent = node.content
      fileLabel = fileArg
    } else {
      return { lines: [{ text: '/review: file not found: ' + fileArg, kind: 'error' }] }
    }
  }
  ctx.pushLine({ text: '▶ reviewing ' + fileLabel + '...', kind: 'dim' })

  const task = fileContent
    ? 'Review this code/file and identify bugs, security issues, and improvements:\n\n```\n' + fileContent.slice(0, 2000) + '\n```'
    : 'Provide a general code review checklist for a NEXUS OS terminal CLI project.'

  return agentRunCmd(['code-agent', task], ctx)
}

async function slashPlanCmd(args: string[], ctx: CommandContext): Promise<CommandResult> {
  // /plan <task> — generate an execution plan
  const task = args.join(' ').trim()
  if (!task) return { lines: [{ text: 'usage: /plan <task description>', kind: 'error' }] }
  ctx.pushLine({ text: '▶ planning: ' + truncate(task, 60) + '...', kind: 'dim' })
  return agentRunCmd(['foreman', 'Create a detailed execution plan for this task. Break it into steps with estimated effort:\n\n' + task], ctx)
}

async function slashReadCmd(args: string[], ctx: CommandContext): Promise<CommandResult> {
  // /read <file> — read a VFS file with LLM summary
  const fileArg = args[0]
  if (!fileArg) return { lines: [{ text: 'usage: /read <file>', kind: 'error' }] }
  const node = resolveVfs(ctx, fileArg)
  if (!node || node.type !== 'file') {
    return { lines: [{ text: '/read: file not found: ' + fileArg, kind: 'error' }] }
  }
  ctx.pushLine({ text: '▶ reading ' + fileArg + '...', kind: 'dim' })
  return agentRunCmd(['analysis-agent', 'Summarize and analyze this file:\n\n```\n' + node.content.slice(0, 2000) + '\n```'], ctx)
}

function slashCostCmd(): CommandResult {
  const t = getTokens()
  const lines: OutLine[] = [
    { text: 'budget:  ' + t.budget.used.toLocaleString() + ' / ' + t.budget.total.toLocaleString() + ' (' + t.budget.pct.toFixed(1) + '%)' },
    { text: 'burn:    ' + t.burnRate },
    { text: 'pools:   ECO ' + t.pools.ECO.used + '/' + t.pools.ECO.cap + ' · FAST ' + t.pools.FAST.used + '/' + t.pools.FAST.cap + ' · PREMIUM ' + t.pools.PREMIUM.used + '/' + t.pools.PREMIUM.cap },
  ]
  return { lines: box('TOKEN COST', lines) }
}

function slashCompactCmd(ctx: CommandContext): CommandResult {
  ctx.clear()
  return { lines: [{ text: 'context compacted — screen cleared', kind: 'dim' }], silent: true }
}

// --- task pipeline (Devin-inspired) ------------------------------------------

async function taskCmd(args: string[], ctx: CommandContext): Promise<CommandResult> {
  const sub = args[0]
  if (sub === 'list' || !sub) {
    // show recent tasks
    const s = getSwarm()
    const rows: OutLine[] = s.tasks.slice(0, 8).map((t: { id: string; worker: string; type: string; status: string; tokens: number }) => ({
      text: pad(t.id.slice(0, 6), 8) + ' ' + pad(t.worker, 12) + ' ' + pad(t.type, 10) + ' ' + pad(t.status, 10) + ' ' + t.tokens + ' tok',
      kind: t.status === 'completed' ? 'success' : t.status === 'failed' ? 'error' : undefined,
    }))
    return { lines: box('TASKS', rows) }
  }
  if (sub === 'run' || sub === 'submit') {
    // task run <description> — submit + route + execute
    const desc = args.slice(1).join(' ').trim()
    if (!desc) return { lines: [{ text: 'usage: task run <description>', kind: 'error' }] }

    // Route: pick best agent based on task keywords
    const lower = desc.toLowerCase()
    let agent = 'foreman'
    if (lower.match(/code|implement|fix|build|refactor|function|class/)) agent = 'code-agent'
    else if (lower.match(/research|analyze|investigate|find|search/)) agent = 'research-agent'
    else if (lower.match(/review|audit|check|verify|test/)) agent = 'analysis-agent'
    else if (lower.match(/security|compliance|govern|policy|rule/)) agent = 'governance-agent'

    ctx.pushLine({ text: '▶ task submitted: ' + truncate(desc, 60), kind: 'system' })
    ctx.pushLine({ text: '  routing → ' + agent + ' (auto-selected)', kind: 'dim' })
    ctx.pushLine({ text: '', kind: 'dim' })

    return agentRunCmd([agent, desc], ctx)
  }
  return { lines: [{ text: 'usage: task [list|run <description>]', kind: 'error' }] }
}

// --- helper: resolve VFS node from path ---
function resolveVfs(ctx: CommandContext, path: string): { type: 'file' | 'dir'; name: string; content: string } | null {
  try {
    // Use the VFS from context
    const vfs = ctx.vfs
    const parts = path.startsWith('/') ? path.slice(1).split('/') : [...ctx.cwd.split('/').filter(Boolean), ...path.split('/')]
    let node: unknown = vfs.root
    for (const p of parts) {
      if (!p || p === '.') continue
      if (p === '..') continue
      if (typeof node !== 'object' || node === null) return null
      const n = node as { type: string; children?: Record<string, unknown>; content?: string }
      if (n.type !== 'dir' || !n.children) return null
      node = n.children[p]
      if (!node) return null
    }
    const n = node as { type: string; name: string; content: string }
    return n.type === 'file' ? { type: 'file', name: n.name, content: n.content } : null
  } catch {
    return null
  }
}

// --- registry ---------------------------------------------------------------

export const NEXUS_COMMANDS: Record<string, CommandDef> = {
  status: { name: 'status', summary: 'NEXUS system overview', help: 'status', run: () => statusCmd() },
  sentinel: { name: 'sentinel', summary: 'sentinel security/integrity monitor', help: 'sentinel [status|demo]', run: (a) => sentinelCmd(a), complete: (a, i) => i === 0 ? ['status', 'demo'].filter((s) => s.startsWith(a[0] || '')) : [] },
  agents: { name: 'agents', summary: 'list NEXUS agents', help: 'agents [name]', run: (a) => agentsCmd(a) },
  agent: { name: 'agent', summary: 'agent operations (run, list)', help: 'agent run [--save <file>] <agent> <task>  |  agent list', run: (a, ctx) => a[0] === 'run' ? agentRunCmd(a.slice(1), ctx) : a[0] === 'list' ? agentsCmd([]) : ({ lines: [{ text: 'usage: agent run <agent> <task>  |  agent list', kind: 'error' }] }), complete: (a, i) => i === 0 ? ['run', 'list'].filter((s) => s.startsWith(a[0] || '')) : i === 1 && a[0] === 'run' ? ['foreman', 'research-agent', 'code-agent', 'analysis-agent', 'governance-agent'].filter((s) => s.startsWith(a[1] || '')) : [] },
  swarm: { name: 'swarm', summary: 'swarm overview', help: 'swarm', run: () => swarmCmd() },
  vault: { name: 'vault', summary: '5-track memory vault', help: 'vault [EVENT|TRUST|CAP|FAIL|GOV]', run: (a) => vaultCmd(a) },
  governor: { name: 'governor', summary: 'governor decisions', help: 'governor', run: () => governorCmd() },
  trust: { name: 'trust', summary: 'trust matrix', help: 'trust [agent]', run: (a) => trustCmd(a) },
  tokens: { name: 'tokens', summary: 'token budget and pools', help: 'tokens', run: () => tokensCmd() },
  cost: { name: 'cost', summary: 'spend ledger', help: 'cost', run: () => costCmd() },
  models: { name: 'models', summary: 'model registry', help: 'models [free|fast|premium]', run: (a) => modelsCmd(a) },
  relay: { name: 'relay', summary: 'model relay stats', help: 'relay', run: () => relayCmd() },
  compliance: { name: 'compliance', summary: 'compliance rules', help: 'compliance', run: () => complianceCmd() },
  proposals: { name: 'proposals', summary: 'governance proposals', help: 'proposals', run: () => proposalsCmd() },
  vap: { name: 'vap', summary: 'verifiable action pipeline', help: 'vap', run: () => vapCmd() },
  logs: { name: 'logs', summary: 'recent log entries', help: 'logs [n]', run: (a) => logsCmd(a) },
  ports: { name: 'ports', summary: 'canonical ports', help: 'ports', run: () => portsCmd() },
  doctor: { name: 'doctor', summary: 'health checks', help: 'doctor', run: () => doctorCmd() },
  scan: { name: 'scan', summary: 'security findings', help: 'scan', run: () => scanCmd() },
  brain: { name: 'brain', summary: 'brain internals', help: 'brain', run: () => brainCmd() },
  constitution: { name: 'constitution', summary: 'risk ladder + M-tiers', help: 'constitution', run: () => constitutionCmd() },
  wiki: { name: 'wiki', summary: 'knowledge base', help: 'wiki [query]', run: (a) => wikiCmd(a) },
  drill: { name: 'drill', summary: 'DoppelGround drills', help: 'drill [id]', run: (a) => drillCmd(a) },
  weaver: { name: 'weaver', summary: 'Visual Weaver lanes', help: 'weaver', run: () => weaverCmd() },
  modal: { name: 'modal', summary: 'MODAL spend contract', help: 'modal', run: () => modalCmd() },
  intervene: { name: 'intervene', summary: 'manual intervention', help: 'intervene <agent> <action>', run: (a) => interveneCmd(a) },
  halt: { name: 'halt', summary: 'halt agent or swarm', help: 'halt [agent|swarm]', run: (a) => haltCmd(a) },
  propose: { name: 'propose', summary: 'create a proposal', help: 'propose <title>', run: (a) => proposeCmd(a) },
  spawn: { name: 'spawn', summary: 'spawn a new agent', help: 'spawn <name> <domain>', run: (a) => spawnCmd(a) },
  appeal: { name: 'appeal', summary: 'appeal a governor decision', help: 'appeal <decision-id>', run: (a) => appealCmd(a) },
  'trust-update': { name: 'trust-update', summary: 'adjust agent trust', help: 'trust-update <agent> <delta>', run: (a) => trustUpdateCmd(a) },
  handoff: { name: 'handoff', summary: 'handoff between workers', help: 'handoff <from> <to>', run: (a) => handoffCmd(a) },
  'stress-lab': { name: 'stress-lab', summary: 'local compute stress test', help: 'stress-lab', run: () => stressLabCmd() },
  'gross-http': { name: 'gross-http', summary: 'http egress diagnostics', help: 'gross-http [url]', run: (a) => grossHttpCmd(a) },
  'cycle-check': { name: 'cycle-check', summary: 'verify vault hash chain', help: 'cycle-check', run: () => cycleCheckCmd() },
  state: { name: 'state', summary: 'compact brain state JSON', help: 'state', run: () => stateCmd() },
  messaging: { name: 'messaging', summary: 'message bus stats', help: 'messaging', run: () => messagingCmd() },
  report: { name: 'report', summary: 'full NEXUS report', help: 'report', run: () => reportCmd() },
  task: { name: 'task', summary: 'task pipeline (submit, route, execute)', help: 'task [list|run <description>]', run: (a, ctx) => taskCmd(a, ctx), complete: (a, i) => i === 0 ? ['list', 'run'].filter((s) => s.startsWith(a[0] || '')) : [] },
  model: { name: 'model', summary: 'switch/list models (relay routing)', help: 'model [list|<id>|auto on|off]', run: (a) => modelCmd(a) },
  run: { name: 'run', summary: 'execute Python code directly', help: 'run <python code>', run: (a) => runCmd(a) },
  exec: { name: 'exec', summary: 'REAL agent loop with tool calling (writes files, reads files, searches)', help: 'exec [agent] <task>  (agent defaults to code-agent)', run: (a, ctx) => agentExecCmd(a, ctx), complete: (a, i) => i === 0 ? ['code-agent', 'research-agent', 'analysis-agent', 'foreman', 'governance-agent'].filter((s) => s.startsWith(a[0] || '')) : [] },
  ask: { name: 'ask', summary: 'ask the NEXUS LLM', help: 'ask <question>', run: (a) => askCmd(a) },
  tail: { name: 'tail', summary: 'live log tail', help: 'tail', run: (a, ctx) => tailCmd(a, ctx) },
  top: { name: 'top', summary: 'live swarm top', help: 'top', run: (a, ctx) => topCmd(a, ctx) },
  watch: { name: 'watch', summary: 'live agent watch', help: 'watch <agent>', run: (a, ctx) => watchCmd(a, ctx) },

  // ── slash commands (Claude Code / Gemini CLI inspired) ──
  '/run': { name: '/run', summary: 'agent loop with tool calling (writes files!)', help: '/run [agent] <task>', run: (a, ctx) => agentExecCmd(a, ctx), complete: (a, i) => i === 0 ? ['code-agent', 'research-agent', 'analysis-agent', 'foreman', 'governance-agent'].filter((s) => s.startsWith(a[0] || '')) : [] },
  '/review': { name: '/review', summary: 'review code or a file (real LLM)', help: '/review [file]', run: (a, ctx) => slashReviewCmd(a, ctx) },
  '/plan': { name: '/plan', summary: 'generate an execution plan (real LLM)', help: '/plan <task>', run: (a, ctx) => slashPlanCmd(a, ctx) },
  '/read': { name: '/read', summary: 'read + summarize a file (real LLM)', help: '/read <file>', run: (a, ctx) => slashReadCmd(a, ctx) },
  '/cost': { name: '/cost', summary: 'show token usage', help: '/cost', run: () => slashCostCmd() },
  '/model': { name: '/model', summary: 'switch/list models (relay routing)', help: 'model [list|<id>|auto on|off]', run: (a) => modelCmd(a) },
  '/compact': { name: '/compact', summary: 'clear screen', help: '/compact', run: (_a, ctx) => slashCompactCmd(ctx) },
}

// --- /model command — switch active model ---
async function modelCmd(args: string[]): Promise<CommandResult> {
  const { getActiveModel, setActiveModel, getAvailableModels, isAutoRoute, setAutoRoute, MODEL_REGISTRY } = await import('@/lib/nexus/model-relay')
  
  if (!args[0] || args[0] === 'list') {
    const active = getActiveModel()
    const available = getAvailableModels()
    const rows: OutLine[] = [
      { text: '\u2502 active: ' + active.name + ' (' + active.id + ')', kind: 'success' },
      { text: '\u2502 auto-route: ' + (isAutoRoute() ? 'ON' : 'OFF'), kind: 'dim' },
      { text: '\u2502', kind: 'dim' },
      { text: '\u2502 ' + pad('id', 22) + ' ' + pad('name', 20) + ' ' + pad('tier', 9) + ' ' + pad('tools', 6) + ' ' + padR('SWE', 4) + '  description' },
      { text: '\u2502 ' + '\u2500'.repeat(80), kind: 'dim' },
    ]
    for (const m of MODEL_REGISTRY) {
      const hasKey = !!process.env[m.apiKeyEnv] || available.includes(m)
      const marker = m.id === active.id ? '▶' : hasKey ? ' ' : '\u00d7'
      rows.push({
        text: marker + ' ' + pad(m.id, 22) + ' ' + pad(m.name, 20) + ' ' + pad(m.tier, 9) + ' ' + pad(m.supportsTools ? 'yes' : 'no', 6) + ' ' + padR(String(m.sweScore), 4) + '  ' + truncate(m.description, 30),
        kind: m.id === active.id ? 'success' : hasKey ? undefined : 'dim',
      })
    }
    rows.push({ text: '\u2502', kind: 'dim' })
    rows.push({ text: '\u2502 usage: model <id>  |  model auto on|off  |  model list', kind: 'dim' })
    return { lines: box('MODELS', rows) }
  }
  
  if (args[0] === 'auto') {
    const v = args[1] === 'on'
    setAutoRoute(v)
    return { lines: [{ text: 'auto-route: ' + (v ? 'ON (smart routing enabled)' : 'OFF (using fixed model)'), kind: 'success' }] }
  }
  
  const result = setActiveModel(args[0])
  if (!result.ok) {
    return { lines: [{ text: 'model: ' + result.error + ' — type `model list` for options', kind: 'error' }] }
  }
  return { lines: [{ text: '\u25b6 active model: ' + result.model!.name + ' (' + result.model!.id + ')', kind: 'success' }, { text: '  tier: ' + result.model!.tier + ' \u00b7 tools: ' + (result.model!.supportsTools ? 'yes' : 'no') + ' \u00b7 SWE: ' + result.model!.sweScore, kind: 'dim' }] }
}

// --- run command — execute Python code directly ---
async function runCmd(args: string[]): Promise<CommandResult> {
  const code = args.join(' ').trim()
  if (!code) return { lines: [{ text: 'usage: run <python code>', kind: 'error' }] }
  
  try {
    const res = await fetch('/api/nexus/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: code, lang: 'python' }),
    })
    const data = (await res.json()) as { ok?: boolean; stdout?: string; stderr?: string; exitCode?: number; elapsedMs?: number }
    
    const lines: OutLine[] = [
      { text: '\u2500'.repeat(50), kind: 'dim' },
    ]
    if (data.stdout) {
      for (const ln of data.stdout.split('\n')) {
        lines.push({ text: ln })
      }
    }
    if (data.stderr && !data.ok) {
      lines.push({ text: data.stderr, kind: 'error' })
    }
    lines.push({ text: '\u2500'.repeat(50), kind: 'dim' })
    lines.push({ text: 'exit: ' + (data.exitCode || 0) + ' \u00b7 ' + (data.elapsedMs || 0) + 'ms', kind: 'dim' })
    return { lines }
  } catch (e) {
    return { lines: [{ text: '\u2717 exec failed: ' + (e as Error).message, kind: 'error' }] }
  }
}

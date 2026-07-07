'use client'

// ============================================================
// NEXUS OS — Command Center app
//
// Real-time dashboard wired to:
//   - the socket.io mini-service on :3003 (SIMULATED telemetry:
//     stats / processes / log)
//   - the in-browser useAgentRunsStore (REAL agent runs started
//     by the Web Agent or any other consumer)
//
// Layout: responsive grid that fits the window without scrolling —
// each internal panel scrolls independently.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  Radar,
  Cpu,
  MemoryStick,
  Activity,
  Wifi,
  Trash2,
  CircleDot,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
} from 'lucide-react'
import { useAgentRunsStore } from '@/stores/agent-runs-store'
import { registerApp } from '@/apps/registry'
import type { WindowComponentProps, AgentRun } from '@/lib/os/types'

// ---- socket payloads --------------------------------------------------

type Stats = {
  ts: string
  cpu: number | string
  mem: number | string
  net: number | string
  uptime?: number
}

type NexusProc = {
  pid: number
  name: string
  cpu: number
  mem: number
  status: 'RUN' | 'IDL' | 'WT' | 'ZMB'
  user: string
}

type LogLine = {
  ts: string
  src: string
  lvl: string
  msg: string
}

// ---- helpers ----------------------------------------------------------

const MAX_LOG = 200

function num(v: number | string): number {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0
}

function fmtUptime(s?: number): string {
  if (typeof s !== 'number' || s < 0) return '--'
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m < 1) return `${sec}s`
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (h < 1) return `${mm}m ${sec}s`
  return `${h}h ${mm}m`
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function statusColor(status: AgentRun['status']): string {
  switch (status) {
    case 'running':
    case 'pending':
      return 'var(--phosphor-bright)'
    case 'awaiting-approval':
      return 'var(--pip-amber)'
    case 'done':
      return 'var(--phosphor)'
    case 'error':
    case 'cancelled':
      return 'var(--cyber-magenta)'
    default:
      return 'var(--phosphor-dim)'
  }
}

function stepIcon(status: AgentRun['steps'][number]['status']): React.ReactNode {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="h-3 w-3" style={{ color: 'var(--phosphor)' }} />
    case 'error':
      return <AlertCircle className="h-3 w-3" style={{ color: 'var(--cyber-magenta)' }} />
    case 'running':
      return <CircleDot className="h-3 w-3 animate-pulse" style={{ color: 'var(--phosphor-bright)' }} />
    case 'awaiting-approval':
      return <Clock className="h-3 w-3" style={{ color: 'var(--pip-amber)' }} />
    default:
      return <CircleDot className="h-3 w-3" style={{ color: 'var(--phosphor-dim)' }} />
  }
}

// ---- panels -----------------------------------------------------------

function PanelShell({
  title,
  badge,
  icon,
  children,
  className = '',
  right,
}: {
  title: string
  badge?: string
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
  right?: React.ReactNode
}) {
  return (
    <section
      className={`flex min-h-0 flex-col border ${className}`}
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <header
        className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-deep)' }}
      >
        {icon}
        <h2
          className="text-[10px] uppercase tracking-[0.25em]"
          style={{ color: 'var(--phosphor-bright)' }}
        >
          {title}
        </h2>
        {badge && (
          <span
            className="ml-1 px-1.5 py-0.5 text-[8px] uppercase tracking-widest"
            style={{
              border: '1px solid var(--border)',
              color: 'var(--phosphor-dim)',
            }}
          >
            {badge}
          </span>
        )}
        <div className="ml-auto">{right}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  )
}

function Gauge({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon: React.ReactNode
}) {
  const v = Math.round(value)
  const color =
    v > 85 ? 'var(--cyber-magenta)' : v > 60 ? 'var(--pip-amber)' : 'var(--phosphor)'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
        <span
          className="flex items-center gap-1"
          style={{ color: 'var(--phosphor-dim)' }}
        >
          {icon}
          {label}
        </span>
        <span className="font-mono tabular-nums" style={{ color }}>
          {v.toString().padStart(2, '0')}%
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden border"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-deep)' }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${v}%`,
            background: color,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      </div>
    </div>
  )
}

// ---- main component ---------------------------------------------------

function CommandCenterApp(_props: WindowComponentProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [procs, setProcs] = useState<NexusProc[]>([])
  const [logs, setLogs] = useState<LogLine[]>([])
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)

  // Real agent runs (subscribed — re-renders on every store change).
  const runs = useAgentRunsStore((s) => s.runs)
  const clearRuns = useAgentRunsStore((s) => s.clearRuns)

  useEffect(() => {
    const sock = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    })
    socketRef.current = sock

    sock.on('connect', () => setConnected(true))
    sock.on('disconnect', () => setConnected(false))
    sock.on('connect_error', () => setConnected(false))

    sock.on('stats', (s: Stats) => setStats(s))
    sock.on('processes', (p: NexusProc[]) => setProcs(Array.isArray(p) ? p : []))
    sock.on('log', (l: LogLine) => {
      setLogs((prev) => {
        const next = [...prev, l]
        return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next
      })
    })

    return () => {
      sock.removeAllListeners()
      sock.disconnect()
      socketRef.current = null
    }
  }, [])

  const activeRuns = useMemo(
    () =>
      runs.filter(
        (r) =>
          r.status === 'running' ||
          r.status === 'pending' ||
          r.status === 'awaiting-approval'
      ),
    [runs]
  )

  const recentRuns = useMemo(
    () =>
      runs
        .filter(
          (r) =>
            r.status === 'done' ||
            r.status === 'error' ||
            r.status === 'cancelled'
        )
        .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
        .slice(0, 12),
    [runs]
  )

  // Activity feed derived from real run events.
  const activity = useMemo(() => {
    const events: Array<{
      ts: number
      kind: 'start' | 'step' | 'end' | 'approval'
      runId: string
      task: string
      text: string
      status: AgentRun['status']
    }> = []
    for (const r of runs) {
      events.push({
        ts: r.startedAt,
        kind: 'start',
        runId: r.id,
        task: r.task,
        text: `RUN START · ${r.recipe} · ${r.engine}`,
        status: r.status,
      })
      for (const s of r.steps) {
        if (s.startedAt) {
          events.push({
            ts: s.startedAt,
            kind: 'step',
            runId: r.id,
            task: r.task,
            text: `STEP ▸ ${s.label}`,
            status: r.status,
          })
        }
      }
      if (r.status === 'awaiting-approval' && r.approvalPrompt) {
        events.push({
          ts: r.startedAt,
          kind: 'approval',
          runId: r.id,
          task: r.task,
          text: `APPROVAL ▸ ${r.approvalPrompt.slice(0, 60)}`,
          status: r.status,
        })
      }
      if (r.endedAt) {
        events.push({
          ts: r.endedAt,
          kind: 'end',
          runId: r.id,
          task: r.task,
          text:
            r.status === 'done'
              ? `RUN COMPLETE · ${r.steps.length} steps`
              : r.status === 'error'
                ? `RUN ERROR · ${r.error ?? 'unknown'}`
                : `RUN ${r.status.toUpperCase()}`,
          status: r.status,
        })
      }
    }
    return events.sort((a, b) => b.ts - a.ts).slice(0, 60)
  }, [runs])

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: 'var(--bg-deep)', color: 'var(--phosphor)' }}
    >
      {/* Header */}
      <header
        className="flex shrink-0 items-center gap-2 border-b px-4 py-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <Radar className="h-4 w-4" style={{ color: 'var(--phosphor-bright)' }} />
        <span
          className="text-xs uppercase tracking-[0.3em]"
          style={{
            color: 'var(--phosphor-bright)',
            fontFamily: 'var(--font-display), ui-monospace, monospace',
          }}
        >
          NEXUS // Command Center
        </span>
        <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-widest">
          <span
            className="flex items-center gap-1"
            style={{ color: connected ? 'var(--phosphor)' : 'var(--cyber-magenta)' }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: connected ? 'var(--phosphor)' : 'var(--cyber-magenta)',
                boxShadow: `0 0 6px ${connected ? 'var(--phosphor-glow)' : 'var(--cyber-magenta)'}`,
              }}
            />
            {connected ? 'LINK' : 'OFFLINE'}
          </span>
          <span style={{ color: 'var(--phosphor-dim)' }}>
            uptime {fmtUptime(stats?.uptime)}
          </span>
        </div>
      </header>

      {/* Content grid */}
      <div
        className="grid min-h-0 flex-1 gap-2 overflow-hidden p-2"
        style={{
          gridTemplateColumns: 'minmax(0, 1fr)',
          gridTemplateRows: 'minmax(0, auto) minmax(0, 1fr) minmax(0, 1fr)',
        }}
      >
        {/* Row 1: stats strip */}
        <PanelShell title="System Stats" badge="simulated" icon={<Activity className="h-3 w-3" />}>
          <div className="grid h-full grid-cols-1 gap-2 p-2 sm:grid-cols-3">
            <Gauge label="CPU" value={num(stats?.cpu ?? 0)} icon={<Cpu className="h-3 w-3" />} />
            <Gauge label="MEM" value={num(stats?.mem ?? 0)} icon={<MemoryStick className="h-3 w-3" />} />
            <Gauge label="NET" value={num(stats?.net ?? 0)} icon={<Wifi className="h-3 w-3" />} />
          </div>
        </PanelShell>

        {/* Row 2: processes (left) + agent observatory (right) */}
        <div className="grid min-h-0 gap-2 lg:grid-cols-2">
          <PanelShell
            title="Processes"
            badge={`simulated · ${procs.length}`}
            icon={<Layers className="h-3 w-3" />}
          >
            <div className="h-full overflow-y-auto">
              <table className="w-full text-[10px]">
                <thead
                  className="sticky top-0"
                  style={{ background: 'var(--bg-deep)', color: 'var(--phosphor-dim)' }}
                >
                  <tr className="text-left uppercase tracking-widest">
                    <th className="px-2 py-1 font-normal">PID</th>
                    <th className="px-2 py-1 font-normal">Name</th>
                    <th className="px-2 py-1 text-right font-normal">CPU%</th>
                    <th className="px-2 py-1 text-right font-normal">MEM</th>
                    <th className="px-2 py-1 text-center font-normal">ST</th>
                  </tr>
                </thead>
                <tbody>
                  {procs.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-2 py-4 text-center opacity-50"
                        style={{ color: 'var(--phosphor-dim)' }}
                      >
                        awaiting process table…
                      </td>
                    </tr>
                  )}
                  {procs.map((p) => (
                    <tr
                      key={p.pid}
                      className="border-t"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <td
                        className="px-2 py-1 font-mono tabular-nums"
                        style={{ color: 'var(--phosphor-dim)' }}
                      >
                        {p.pid}
                      </td>
                      <td className="px-2 py-1" style={{ color: 'var(--phosphor-bright)' }}>
                        {p.name}
                      </td>
                      <td
                        className="px-2 py-1 text-right font-mono tabular-nums"
                        style={{
                          color: p.cpu > 50 ? 'var(--pip-amber)' : 'var(--phosphor)',
                        }}
                      >
                        {p.cpu.toFixed(1)}
                      </td>
                      <td
                        className="px-2 py-1 text-right font-mono tabular-nums"
                        style={{ color: 'var(--phosphor)' }}
                      >
                        {p.mem}
                      </td>
                      <td
                        className="px-2 py-1 text-center font-mono"
                        style={{
                          color:
                            p.status === 'ZMB'
                              ? 'var(--cyber-magenta)'
                              : p.status === 'WT'
                                ? 'var(--pip-amber)'
                                : p.status === 'IDL'
                                  ? 'var(--phosphor-dim)'
                                  : 'var(--phosphor)',
                        }}
                      >
                        {p.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelShell>

          <PanelShell
            title="Agent Observatory"
            badge="real"
            icon={<Radar className="h-3 w-3" />}
            right={
              <button
                type="button"
                onClick={clearRuns}
                disabled={runs.length === 0}
                className="flex items-center gap-1 border px-1.5 py-0.5 text-[9px] uppercase tracking-widest transition enabled:hover:bg-[var(--bg-deep)] disabled:opacity-30"
                style={{ borderColor: 'var(--border)', color: 'var(--phosphor-dim)' }}
                aria-label="Clear all runs"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            }
          >
            <div className="h-full overflow-y-auto p-2">
              {runs.length === 0 && (
                <div
                  className="flex h-full items-center justify-center text-[10px] uppercase tracking-widest opacity-60"
                  style={{ color: 'var(--phosphor-dim)' }}
                >
                  no runs — launch the web agent
                </div>
              )}

              {activeRuns.length > 0 && (
                <div className="mb-2 space-y-1.5">
                  <div
                    className="text-[9px] uppercase tracking-widest"
                    style={{ color: 'var(--phosphor-dim)' }}
                  >
                    Active ({activeRuns.length})
                  </div>
                  {activeRuns.map((r) => (
                    <RunCard key={r.id} run={r} expanded />
                  ))}
                </div>
              )}

              {recentRuns.length > 0 && (
                <div className="space-y-1.5">
                  <div
                    className="text-[9px] uppercase tracking-widest"
                    style={{ color: 'var(--phosphor-dim)' }}
                  >
                    Recent ({recentRuns.length})
                  </div>
                  {recentRuns.map((r) => (
                    <RunCard key={r.id} run={r} />
                  ))}
                </div>
              )}
            </div>
          </PanelShell>
        </div>

        {/* Row 3: log feed + activity feed */}
        <div className="grid min-h-0 gap-2 lg:grid-cols-2">
          <PanelShell
            title="Log Feed"
            badge="simulated"
            icon={<Activity className="h-3 w-3" />}
          >
            <div
              className="h-full overflow-y-auto p-2 font-mono text-[10px]"
              style={{ background: 'var(--bg-deep)' }}
            >
              {logs.length === 0 && (
                <div
                  className="opacity-50"
                  style={{ color: 'var(--phosphor-dim)' }}
                >
                  awaiting log stream…
                </div>
              )}
              {logs.map((l, i) => (
                <div key={`${l.ts}-${i}`} className="flex gap-2">
                  <span style={{ color: 'var(--phosphor-dim)' }}>{l.ts}</span>
                  <span
                    style={{
                      color:
                        l.lvl === 'WARN'
                          ? 'var(--pip-amber)'
                          : l.lvl === 'OK'
                            ? 'var(--phosphor-bright)'
                            : l.lvl === 'DBG'
                              ? 'var(--phosphor-dim)'
                              : 'var(--phosphor)',
                    }}
                  >
                    [{l.lvl}]
                  </span>
                  <span style={{ color: 'var(--phosphor-dim)' }}>{l.src}</span>
                  <span style={{ color: 'var(--phosphor)' }}>{l.msg}</span>
                </div>
              ))}
            </div>
          </PanelShell>

          <PanelShell
            title="Activity Feed"
            badge={`real · ${activity.length}`}
            icon={<Activity className="h-3 w-3" />}
          >
            <div className="h-full overflow-y-auto p-2 font-mono text-[10px]">
              {activity.length === 0 && (
                <div
                  className="opacity-50"
                  style={{ color: 'var(--phosphor-dim)' }}
                >
                  no activity — agent runs will appear here in real time
                </div>
              )}
              {activity.map((a, i) => (
                <div
                  key={`${a.runId}-${a.kind}-${i}`}
                  className="flex gap-2 border-b py-0.5"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span style={{ color: 'var(--phosphor-dim)' }}>
                    {fmtTime(a.ts)}
                  </span>
                  <span style={{ color: statusColor(a.status) }}>{a.text}</span>
                </div>
              ))}
            </div>
          </PanelShell>
        </div>
      </div>
    </div>
  )
}

// ---- run card (active = expanded with steps; recent = collapsed) -----

function RunCard({ run, expanded = false }: { run: AgentRun; expanded?: boolean }) {
  return (
    <div
      className="border p-1.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--bg-deep)',
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            background: statusColor(run.status),
            boxShadow: `0 0 6px ${statusColor(run.status)}`,
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--phosphor-bright)' }}
              title={run.task}
            >
              {run.task || '(no task)'}
            </span>
            <span
              className="ml-auto shrink-0 text-[9px] uppercase tracking-widest"
              style={{ color: statusColor(run.status) }}
            >
              {run.status}
            </span>
          </div>
          <div
            className="mt-0.5 flex items-center gap-2 text-[9px] uppercase tracking-widest"
            style={{ color: 'var(--phosphor-dim)' }}
          >
            <span>{run.recipe}</span>
            <span>·</span>
            <span className="truncate">{run.engine}</span>
            <span>·</span>
            <span>{fmtTime(run.startedAt)}</span>
          </div>
        </div>
      </div>

      {expanded && run.steps.length > 0 && (
        <ol
          className="mt-1.5 ml-3 space-y-0.5 border-l pl-2"
          style={{ borderColor: 'var(--border)' }}
        >
          {run.steps.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5 text-[9px]">
              {stepIcon(s.status)}
              <span
                className="truncate"
                style={{ color: 'var(--phosphor)' }}
                title={s.detail}
              >
                {s.label}
              </span>
              {s.startedAt && (
                <span
                  className="ml-auto shrink-0 font-mono"
                  style={{ color: 'var(--phosphor-dim)' }}
                >
                  {fmtTime(s.startedAt)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {expanded && run.error && (
        <div
          className="mt-1 truncate text-[9px]"
          style={{ color: 'var(--cyber-magenta)' }}
          title={run.error}
        >
          err: {run.error}
        </div>
      )}

      {expanded && run.finalResult && (
        <details className="mt-1">
          <summary
            className="cursor-pointer text-[9px] uppercase tracking-widest"
            style={{ color: 'var(--phosphor-dim)' }}
          >
            final result
          </summary>
          <pre
            className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[9px]"
            style={{ color: 'var(--phosphor)' }}
          >
            {run.finalResult}
          </pre>
        </details>
      )}
    </div>
  )
}

registerApp({
  id: 'command-center',
  name: 'Command Center',
  icon: <Radar className="h-5 w-5" />,
  component: CommandCenterApp,
  defaultSize: { x: 40, y: 40, w: 960, h: 640 },
  minSize: { x: 0, y: 0, w: 560, h: 400 },
  singleton: true,
  pinned: true,
  category: 'system',
  title: 'Command Center',
})

export { CommandCenterApp }

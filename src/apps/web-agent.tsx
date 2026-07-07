'use client'

// ============================================================
// NEXUS OS — Web Agent app
//
// Two engines:
//   SEQ (HB)    Sequential Hyperbrowser agent. POSTs to
//               /api/hyperbrowser/agent, polls the job, streams
//               real steps into the agent-runs-store.
//   PAR-BL      Parallel Browserless BoN. POSTs to
//               /api/browserless/agent with N attempts, receives
//               narratives + a judgement, picks the winner.
//
// Layout fits the window without scrolling — every internal panel
// scrolls independently (flex column with min-h-0).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Bot,
  Play,
  Square,
  ExternalLink,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Trophy,
  Layers,
  Cpu,
  XCircle,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useAgentRunsStore } from '@/stores/agent-runs-store'
import { registerApp } from '@/apps/registry'
import type { WindowComponentProps } from '@/lib/os/types'

// ---- types ------------------------------------------------------------

type Engine = 'seq-hb' | 'par-bl'

type HbStep = {
  thoughts?: string
  actions?: Array<{ type?: string; [k: string]: any }>
  [k: string]: any
}

type HbJobStatus = {
  status?: string
  liveUrl?: string
  error?: string
  steps?: HbStep[]
  data?: {
    steps?: HbStep[]
    status?: string
    error?: string
    output?: any
    finalResult?: string
  }
  output?: any
  finalResult?: string
}

type Narrative = {
  id: string
  content: string
  error?: string
}

type Judgment = {
  winner: string | number | null
  reasoning: string
  scores: Record<string, number>
}

// ---- helpers ----------------------------------------------------------

const MODELS: Array<{ id: string; label: string }> = [
  { id: 'zai:glm-5.2', label: 'ZAI · GLM 5.2' },
  { id: 'zai:glm-4.6', label: 'ZAI · GLM 4.6' },
  { id: 'groq:openai/gpt-oss-120b', label: 'Groq · GPT-OSS 120B' },
  { id: 'cerebras:llama-3.3-70b', label: 'Cerebras · Llama 3.3 70B' },
  { id: 'openrouter:auto', label: 'OpenRouter · Auto' },
]

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function summarizeStep(s: HbStep, idx: number): { thought: string; action: string } {
  const thought =
    (typeof s.thoughts === 'string' && s.thoughts) ||
    (typeof s.agentOutput?.thoughts === 'string' && s.agentOutput.thoughts) ||
    ''
  const rawActions: any[] =
    Array.isArray(s.actions) ? s.actions :
    Array.isArray(s.agentOutput?.actions) ? s.agentOutput.actions :
    []
  const action = rawActions
    .map((a) => {
      if (!a || typeof a !== 'object') return ''
      const t = a.type ?? a.name ?? a.action ?? 'action'
      const keys = Object.keys(a).filter((k) => k !== 'type' && k !== 'name' && k !== 'action')
      const extra = keys.slice(0, 2).map((k) => `${k}=${typeof a[k] === 'string' ? a[k].slice(0, 40) : a[k]}`).join(' ')
      return extra ? `${t}(${extra})` : t
    })
    .filter(Boolean)
    .join(' · ')
  return {
    thought: thought.slice(0, 280),
    action: action.slice(0, 220) || `(step ${idx + 1})`,
  }
}

// ---- panel shell ------------------------------------------------------

function Panel({
  title,
  badge,
  icon,
  children,
  right,
}: {
  title: string
  badge?: string
  icon?: React.ReactNode
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <section
      className="flex min-h-0 flex-col border"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
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
            className="px-1.5 py-0.5 text-[8px] uppercase tracking-widest"
            style={{ border: '1px solid var(--border)', color: 'var(--phosphor-dim)' }}
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

// ---- main app ---------------------------------------------------------

function WebAgentApp(_props: WindowComponentProps) {
  const [engine, setEngine] = useState<Engine>('seq-hb')
  const [task, setTask] = useState('')
  const [n, setN] = useState(2)
  const [maxSteps, setMaxSteps] = useState(8)
  const [model, setModel] = useState(MODELS[0].id)

  const [running, setRunning] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'amber' | 'magenta'; text: string } | null>(null)

  // SEQ state
  const [jobId, setJobId] = useState<string | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [hbSteps, setHbSteps] = useState<HbStep[]>([])
  const [finalResult, setFinalResult] = useState<string>('')
  const [pollTimer, setPollTimer] = useState<ReturnType<typeof setInterval> | null>(null)

  // PAR-BL state
  const [narratives, setNarratives] = useState<Narrative[]>([])
  const [judgment, setJudgment] = useState<Judgment | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [attemptProgress, setAttemptProgress] = useState<Array<{ label: string; status: 'running' | 'done' | 'error' }>>([])

  const startRun = useAgentRunsStore((s) => s.startRun)
  const addStep = useAgentRunsStore((s) => s.addStep)
  const updateStep = useAgentRunsStore((s) => s.updateStep)
  const endRun = useAgentRunsStore((s) => s.endRun)
  const updateRun = useAgentRunsStore((s) => s.updateRun)

  // Persist the active runId across renders without causing re-renders.
  const runIdRef = useRef<string | null>(null)

  // Cleanup any active poller on unmount.
  useEffect(() => {
    return () => {
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [pollTimer])

  const reset = useCallback(() => {
    setJobId(null)
    setLiveUrl(null)
    setHbSteps([])
    setFinalResult('')
    setNarratives([])
    setJudgment(null)
    setActiveTab(0)
    setAttemptProgress([])
    setBanner(null)
    runIdRef.current = null
  }, [])

  // ---- SEQ (Hyperbrowser) -------------------------------------------

  const pollHbJob = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/hyperbrowser/agent/${id}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) {
          if (res.status === 402) {
            setBanner({ kind: 'amber', text: 'Hyperbrowser free-plan limit reached (402).' })
            setRunning(false)
            if (pollTimer) clearInterval(pollTimer)
            if (runIdRef.current) endRun(runIdRef.current, 'error', undefined, 'HB 402 free-plan limit')
            return
          }
          return // transient — try again next tick
        }
        const data: HbJobStatus = await res.json()
        const job: HbJobStatus = data?.data && typeof data.data === 'object' ? { ...data, ...data.data } : data

        const allSteps = Array.isArray(job.steps) ? job.steps : Array.isArray(job.data?.steps) ? job.data!.steps! : []
        if (allSteps.length > 0) {
          setHbSteps(allSteps)
          // Sync new steps into the agent-runs-store timeline.
          if (runIdRef.current) {
            const run = useAgentRunsStore.getState().runs.find((r) => r.id === runIdRef.current)
            const existing = run?.steps.length ?? 0
            for (let i = existing; i < allSteps.length; i++) {
              const summary = summarizeStep(allSteps[i], i)
              const stepId = addStep(runIdRef.current!, summary.thought ? summary.thought.slice(0, 60) : `step ${i + 1}`)
              updateStep(runIdRef.current!, stepId, { status: 'done', detail: summary.action })
            }
          }
        }

        const status = (job.status || job.data?.status || '').toLowerCase()
        if (status === 'completed' || status === 'success') {
          const final =
            typeof job.finalResult === 'string' ? job.finalResult :
            typeof job.data?.finalResult === 'string' ? job.data!.finalResult! :
            typeof job.output === 'string' ? job.output :
            JSON.stringify(job.output ?? job.data ?? {}, null, 2)
          setFinalResult(final)
          setRunning(false)
          if (pollTimer) clearInterval(pollTimer)
          if (runIdRef.current) endRun(runIdRef.current, 'done', final.slice(0, 4000))
        } else if (status === 'failed' || status === 'error') {
          const errMsg = job.error || job.data?.error || 'agent failed'
          setBanner({ kind: 'magenta', text: `HB job failed: ${errMsg}` })
          setRunning(false)
          if (pollTimer) clearInterval(pollTimer)
          if (runIdRef.current) endRun(runIdRef.current, 'error', undefined, errMsg)
        }
      } catch (err) {
        // network blip — keep polling
        const m = err instanceof Error ? err.message : String(err)
        if (runIdRef.current) updateRun(runIdRef.current, { bon: `poll error: ${m}` })
      }
    },
    [addStep, updateStep, endRun, pollTimer, updateRun]
  )

  const runSeqHb = useCallback(async () => {
    reset()
    setRunning(true)
    runIdRef.current = startRun({
      recipe: 'hb:sequential',
      task,
      engine: model,
      source: 'web-agent',
    })
    try {
      const res = await fetch('/api/hyperbrowser/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, maxSteps, model }),
      })
      if (res.status === 402) {
        setBanner({ kind: 'amber', text: 'Hyperbrowser free-plan limit reached (402).' })
        setRunning(false)
        if (runIdRef.current) endRun(runIdRef.current, 'error', undefined, 'HB 402 free-plan limit')
        return
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        setBanner({ kind: 'magenta', text: `HB start failed (${res.status}): ${txt.slice(0, 140)}` })
        setRunning(false)
        if (runIdRef.current) endRun(runIdRef.current, 'error', undefined, `HB ${res.status}`)
        return
      }
      const data = await res.json()
      const id: string | undefined = data?.jobId ?? data?.id ?? data?.job?.id
      const url: string | undefined = data?.liveUrl ?? data?.live_url ?? data?.job?.liveUrl
      if (!id) {
        setBanner({ kind: 'magenta', text: 'HB response missing jobId.' })
        setRunning(false)
        if (runIdRef.current) endRun(runIdRef.current, 'error', undefined, 'no jobId')
        return
      }
      setJobId(id)
      if (url) setLiveUrl(url)

      // kick off the poller
      const t = setInterval(() => {
        void pollHbJob(id)
      }, 2500)
      setPollTimer(t)
      // immediate first poll
      void pollHbJob(id)
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      setBanner({ kind: 'magenta', text: `HB network error: ${m}` })
      setRunning(false)
      if (runIdRef.current) endRun(runIdRef.current, 'error', undefined, m)
    }
  }, [task, maxSteps, model, reset, startRun, endRun, pollHbJob])

  // ---- PAR-BL (Browserless BoN) -------------------------------------

  const runParBl = useCallback(async () => {
    reset()
    setRunning(true)
    runIdRef.current = startRun({
      recipe: `bl:parallel-bon:n=${n}`,
      task,
      engine: model,
      source: 'web-agent',
      steps: Array.from({ length: n }, (_, i) => ({ label: `attempt-${i + 1}` })),
    })
    setAttemptProgress(
      Array.from({ length: n }, (_, i) => ({ label: `attempt-${i + 1}`, status: 'running' as const }))
    )

    try {
      const res = await fetch('/api/browserless/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, n, maxSteps, model }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        setBanner({ kind: 'magenta', text: `BL failed (${res.status}): ${txt.slice(0, 140)}` })
        setRunning(false)
        setAttemptProgress((prev) => prev.map((p) => ({ ...p, status: 'error' })))
        if (runIdRef.current) endRun(runIdRef.current, 'error', undefined, `BL ${res.status}`)
        return
      }
      const data = await res.json()
      const ok: boolean = Boolean(data?.ok ?? data?.success)
      const narrs: Narrative[] = Array.isArray(data?.narratives)
        ? data.narratives.map((nr: any, i: number) => ({
            id: typeof nr?.id === 'string' ? nr.id : `attempt-${i + 1}`,
            content: typeof nr?.content === 'string' ? nr.content : typeof nr === 'string' ? nr : JSON.stringify(nr),
            error: typeof nr?.error === 'string' ? nr.error : undefined,
          }))
        : []
      const jud: Judgment | null = data?.judgment && typeof data.judgment === 'object'
        ? {
            winner: data.judgment.winner ?? null,
            reasoning: typeof data.judgment.reasoning === 'string' ? data.judgment.reasoning : '',
            scores: data.judgment.scores && typeof data.judgment.scores === 'object' ? data.judgment.scores : {},
          }
        : null

      if (!ok || narrs.length === 0) {
        setBanner({ kind: 'magenta', text: 'BL returned no narratives.' })
        setRunning(false)
        setAttemptProgress((prev) => prev.map((p) => ({ ...p, status: 'error' })))
        if (runIdRef.current) endRun(runIdRef.current, 'error', undefined, 'no narratives')
        return
      }

      setNarratives(narrs)
      setJudgment(jud)
      setActiveTab(0)
      setAttemptProgress((prev) =>
        prev.map((p, i) => ({ ...p, status: narrs[i]?.error ? 'error' : 'done' }))
      )

      // Mark every step done in the runs store.
      if (runIdRef.current) {
        const run = useAgentRunsStore.getState().runs.find((r) => r.id === runIdRef.current)
        if (run) {
          run.steps.forEach((s, i) => {
            updateStep(runIdRef.current!, s.id, {
              status: narrs[i]?.error ? 'error' : 'done',
              detail: narrs[i]?.content.slice(0, 200) ?? '',
            })
          })
        }
      }

      const winnerId = jud?.winner
      const winnerNarrative = narrs.find((nr) => String(nr.id) === String(winnerId)) ?? narrs[0]
      const final = jud
        ? `## Winner: ${jud.winner ?? '—'}\n\n**Reasoning:** ${jud.reasoning}\n\n### Scores\n${Object.entries(
            jud.scores
          )
            .map(([id, sc]) => `- ${id}: ${sc}`)
            .join('\n')}\n\n---\n\n${winnerNarrative?.content ?? ''}`
        : winnerNarrative?.content ?? ''
      setFinalResult(final)
      setRunning(false)
      if (runIdRef.current) endRun(runIdRef.current, 'done', final.slice(0, 4000))
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      setBanner({ kind: 'magenta', text: `BL network error: ${m}` })
      setRunning(false)
      setAttemptProgress((prev) => prev.map((p) => ({ ...p, status: 'error' })))
      if (runIdRef.current) endRun(runIdRef.current, 'error', undefined, m)
    }
  }, [n, task, maxSteps, model, reset, startRun, endRun, updateStep])

  // ---- stop ---------------------------------------------------------

  const stop = useCallback(() => {
    if (pollTimer) clearInterval(pollTimer)
    setPollTimer(null)
    setRunning(false)
    if (runIdRef.current) {
      endRun(runIdRef.current, 'cancelled')
    }
  }, [pollTimer, endRun])

  const canRun = task.trim().length > 0 && !running

  // ---- render -------------------------------------------------------

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
        <Bot className="h-4 w-4" style={{ color: 'var(--phosphor-bright)' }} />
        <span
          className="text-xs uppercase tracking-[0.3em]"
          style={{
            color: 'var(--phosphor-bright)',
            fontFamily: 'var(--font-display), ui-monospace, monospace',
          }}
        >
          NEXUS // Web Agent
        </span>
        <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-widest">
          <span
            className="flex items-center gap-1"
            style={{ color: running ? 'var(--phosphor-bright)' : 'var(--phosphor-dim)' }}
          >
            {running && <Loader2 className="h-3 w-3 animate-spin" />}
            {running ? 'RUNNING' : 'IDLE'}
          </span>
        </div>
      </header>

      {/* Config row */}
      <div
        className="grid shrink-0 gap-2 border-b p-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-end gap-2">
          {/* Engine toggle */}
          <div className="flex border" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              onClick={() => setEngine('seq-hb')}
              className="px-3 py-1.5 text-[10px] uppercase tracking-widest transition"
              style={{
                background: engine === 'seq-hb' ? 'var(--card)' : 'transparent',
                color: engine === 'seq-hb' ? 'var(--phosphor-bright)' : 'var(--phosphor-dim)',
              }}
              aria-pressed={engine === 'seq-hb'}
            >
              SEQ · HB
            </button>
            <button
              type="button"
              onClick={() => setEngine('par-bl')}
              className="px-3 py-1.5 text-[10px] uppercase tracking-widest transition"
              style={{
                background: engine === 'par-bl' ? 'var(--card)' : 'transparent',
                color: engine === 'par-bl' ? 'var(--phosphor-bright)' : 'var(--phosphor-dim)',
              }}
              aria-pressed={engine === 'par-bl'}
            >
              PAR · BL
            </button>
          </div>

          {engine === 'par-bl' && (
            <div className="flex flex-col">
              <Label
                htmlFor="n-selector"
                className="text-[9px] uppercase tracking-widest"
                style={{ color: 'var(--phosphor-dim)' }}
              >
                N (BoN)
              </Label>
              <Input
                id="n-selector"
                type="number"
                min={1}
                max={3}
                value={n}
                onChange={(e) =>
                  setN(Math.max(1, Math.min(3, Number(e.target.value) || 1)))
                }
                className="w-16 font-mono text-xs"
                style={{
                  background: 'var(--card)',
                  borderColor: 'var(--border)',
                  color: 'var(--phosphor-bright)',
                }}
              />
            </div>
          )}

          <div className="flex flex-col">
            <Label
              htmlFor="max-steps"
              className="text-[9px] uppercase tracking-widest"
              style={{ color: 'var(--phosphor-dim)' }}
            >
              Max Steps
            </Label>
            <Input
              id="max-steps"
              type="number"
              min={1}
              max={30}
              value={maxSteps}
              onChange={(e) =>
                setMaxSteps(Math.max(1, Math.min(30, Number(e.target.value) || 1)))
              }
              className="w-20 font-mono text-xs"
              style={{
                background: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--phosphor-bright)',
              }}
            />
          </div>

          <div className="flex flex-col">
            <Label
              htmlFor="model-pick"
              className="text-[9px] uppercase tracking-widest"
              style={{ color: 'var(--phosphor-dim)' }}
            >
              Model
            </Label>
            <select
              id="model-pick"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-8 border px-2 font-mono text-xs"
              style={{
                background: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--phosphor-bright)',
              }}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-end gap-1.5">
            {running ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={stop}
                className="gap-1 text-[10px] uppercase tracking-widest"
                style={{
                  borderColor: 'var(--cyber-magenta)',
                  color: 'var(--cyber-magenta)',
                }}
              >
                <Square className="h-3 w-3" /> Stop
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={engine === 'seq-hb' ? runSeqHb : runParBl}
                disabled={!canRun}
                className="gap-1 text-[10px] uppercase tracking-widest"
                style={{
                  background: 'var(--phosphor)',
                  color: 'var(--bg-deep)',
                }}
              >
                <Play className="h-3 w-3" /> Run
              </Button>
            )}
          </div>
        </div>

        <Textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Describe the web task — e.g. ‘Find the top 3 GLM-5 blog posts and summarise each in 2 sentences.’"
          rows={2}
          className="resize-none font-mono text-xs"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--border)',
            color: 'var(--phosphor-bright)',
          }}
        />

        {banner && (
          <div
            className="flex items-center gap-2 border px-2 py-1.5 text-[10px]"
            style={{
              borderColor: banner.kind === 'amber' ? 'var(--pip-amber)' : 'var(--cyber-magenta)',
              color: banner.kind === 'amber' ? 'var(--pip-amber)' : 'var(--cyber-magenta)',
              background: 'var(--bg-deep)',
            }}
            role="alert"
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="truncate">{banner.text}</span>
          </div>
        )}
      </div>

      {/* Main area: 2 columns, each scrolls internally */}
      <div className="grid min-h-0 flex-1 gap-2 overflow-hidden p-2 lg:grid-cols-2">
        {/* Left column */}
        {engine === 'seq-hb' ? (
          <>
            <Panel
              title="Live View"
              badge={jobId ? `job ${jobId.slice(0, 8)}…` : undefined}
              icon={<ExternalLink className="h-3 w-3" />}
              right={
                liveUrl ? (
                  <a
                    href={liveUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[9px] uppercase tracking-widest underline"
                    style={{ color: 'var(--phosphor-bright)' }}
                  >
                    open ↗
                  </a>
                ) : undefined
              }
            >
              <div className="h-full" style={{ minHeight: 220 }}>
                {liveUrl ? (
                  <iframe
                    src={liveUrl}
                    title="Hyperbrowser live view"
                    className="h-full w-full border-0"
                    style={{ background: '#000', minHeight: 220 }}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                ) : (
                  <div
                    className="flex h-full min-h-[220px] items-center justify-center text-[10px] uppercase tracking-widest opacity-50"
                    style={{ color: 'var(--phosphor-dim)', background: 'var(--bg-deep)' }}
                  >
                    {running ? 'awaiting live url…' : 'no live view'}
                  </div>
                )}
              </div>
            </Panel>

            <Panel
              title="Step Timeline"
              badge={`${hbSteps.length} steps`}
              icon={<Layers className="h-3 w-3" />}
            >
              <div className="h-full overflow-y-auto p-2">
                {hbSteps.length === 0 && (
                  <div
                    className="opacity-50 text-[10px] uppercase tracking-widest"
                    style={{ color: 'var(--phosphor-dim)' }}
                  >
                    no steps yet — start a run
                  </div>
                )}
                <ol className="space-y-1.5">
                  {hbSteps.map((s, i) => {
                    const sum = summarizeStep(s, i)
                    return (
                      <li
                        key={i}
                        className="border p-1.5"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-deep)' }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-mono text-[9px] tabular-nums"
                            style={{ color: 'var(--phosphor-dim)' }}
                          >
                            #{String(i + 1).padStart(2, '0')}
                          </span>
                          <span
                            className="text-[9px] uppercase tracking-widest"
                            style={{ color: 'var(--phosphor-bright)' }}
                          >
                            {sum.action}
                          </span>
                        </div>
                        {sum.thought && (
                          <p
                            className="mt-1 text-[10px] leading-snug"
                            style={{ color: 'var(--phosphor)' }}
                          >
                            {sum.thought}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </div>
            </Panel>
          </>
        ) : (
          <>
            <Panel
              title="Attempts"
              badge={`n=${n}`}
              icon={<Cpu className="h-3 w-3" />}
            >
              <div className="flex h-full flex-col">
                {/* progress strip */}
                <div
                  className="grid shrink-0 gap-1 border-b p-1.5"
                  style={{
                    borderColor: 'var(--border)',
                    gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(0, 1fr))`,
                  }}
                >
                  {attemptProgress.map((p, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center gap-0.5 border px-1 py-1"
                      style={{
                        borderColor: 'var(--border)',
                        color:
                          p.status === 'done'
                            ? 'var(--phosphor)'
                            : p.status === 'error'
                              ? 'var(--cyber-magenta)'
                              : 'var(--phosphor-bright)',
                      }}
                    >
                      {p.status === 'running' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : p.status === 'done' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      <span className="text-[8px] uppercase tracking-widest">{p.label}</span>
                    </div>
                  ))}
                </div>
                {/* tabs */}
                {narratives.length > 0 && (
                  <div
                    className="flex shrink-0 flex-wrap gap-0.5 border-b p-1"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {narratives.map((nr, i) => {
                      const active = i === activeTab
                      const isWinner = judgment && String(judgment.winner) === String(nr.id)
                      return (
                        <button
                          key={nr.id}
                          type="button"
                          onClick={() => setActiveTab(i)}
                          className="flex items-center gap-1 border px-2 py-0.5 text-[9px] uppercase tracking-widest"
                          style={{
                            borderColor: active ? 'var(--phosphor)' : 'var(--border)',
                            color: active ? 'var(--phosphor-bright)' : 'var(--phosphor-dim)',
                            background: active ? 'var(--card)' : 'transparent',
                          }}
                        >
                          {isWinner && <Trophy className="h-3 w-3" style={{ color: 'var(--pip-amber)' }} />}
                          {nr.id}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {narratives.length === 0 ? (
                    <div
                      className="opacity-50 text-[10px] uppercase tracking-widest"
                      style={{ color: 'var(--phosphor-dim)' }}
                    >
                      no attempts — start a run
                    </div>
                  ) : (
                    <div className="text-[11px] leading-relaxed" style={{ color: 'var(--phosphor)' }}>
                      {narratives[activeTab]?.error ? (
                        <span style={{ color: 'var(--cyber-magenta)' }}>
                          error: {narratives[activeTab].error}
                        </span>
                      ) : (
                        <ReactMarkdown>{narratives[activeTab]?.content ?? ''}</ReactMarkdown>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Panel>

            <Panel
              title="Judgement"
              badge={judgment ? 'scored' : undefined}
              icon={<Trophy className="h-3 w-3" />}
            >
              <div className="h-full overflow-y-auto p-2">
                {!judgment && (
                  <div
                    className="opacity-50 text-[10px] uppercase tracking-widest"
                    style={{ color: 'var(--phosphor-dim)' }}
                  >
                    no judgement yet
                  </div>
                )}
                {judgment && (
                  <div className="space-y-2">
                    <div
                      className="border p-2"
                      style={{ borderColor: 'var(--pip-amber)', background: 'var(--bg-deep)' }}
                    >
                      <div
                        className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest"
                        style={{ color: 'var(--pip-amber)' }}
                      >
                        <Trophy className="h-3 w-3" />
                        Winner
                      </div>
                      <div
                        className="mt-0.5 font-mono text-sm"
                        style={{ color: 'var(--phosphor-bright)' }}
                      >
                        {judgment.winner ?? '—'}
                      </div>
                    </div>
                    {judgment.reasoning && (
                      <div className="text-[11px]" style={{ color: 'var(--phosphor)' }}>
                        {judgment.reasoning}
                      </div>
                    )}
                    {Object.keys(judgment.scores).length > 0 && (
                      <div className="space-y-1">
                        <div
                          className="text-[9px] uppercase tracking-widest"
                          style={{ color: 'var(--phosphor-dim)' }}
                        >
                          Scores
                        </div>
                        {Object.entries(judgment.scores).map(([id, sc]) => (
                          <div key={id} className="space-y-0.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span style={{ color: 'var(--phosphor-bright)' }}>{id}</span>
                              <span
                                className="font-mono tabular-nums"
                                style={{ color: 'var(--phosphor)' }}
                              >
                                {sc}
                              </span>
                            </div>
                            <div
                              className="h-1 w-full overflow-hidden"
                              style={{ background: 'var(--bg-deep)' }}
                            >
                              <div
                                className="h-full"
                                style={{
                                  width: `${sc}%`,
                                  background: 'var(--phosphor)',
                                  boxShadow: '0 0 6px var(--phosphor-glow)',
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Panel>
          </>
        )}
      </div>

      {/* Final result (always at the bottom for both engines) */}
      {finalResult && (
        <div
          className="shrink-0 border-t"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
            maxHeight: '40%',
          }}
        >
          <header
            className="flex items-center gap-2 border-b px-3 py-1.5"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-deep)' }}
          >
            <CheckCircle2 className="h-3 w-3" style={{ color: 'var(--phosphor)' }} />
            <h2
              className="text-[10px] uppercase tracking-[0.25em]"
              style={{ color: 'var(--phosphor-bright)' }}
            >
              Final Result
            </h2>
          </header>
          <div
            className="overflow-y-auto p-2 text-[11px] leading-relaxed"
            style={{ color: 'var(--phosphor)', maxHeight: 220 }}
          >
            <ReactMarkdown>{finalResult}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

registerApp({
  id: 'web-agent',
  name: 'Web Agent',
  icon: <Bot className="h-5 w-5" />,
  component: WebAgentApp,
  defaultSize: { x: 60, y: 40, w: 1000, h: 680 },
  minSize: { x: 0, y: 0, w: 640, h: 460 },
  singleton: true,
  pinned: true,
  category: 'ai',
  title: 'Web Agent',
})

export { WebAgentApp }

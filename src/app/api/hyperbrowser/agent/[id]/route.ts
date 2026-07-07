// ============================================================
// NEXUS OS — /api/hyperbrowser/agent/[id]  (GET)
//
// Calls Hyperbrowser GET /api/task/hyper-agent/{id} with x-api-key auth.
// Returns { ok, status, steps, finalResult, error }.
//
// Maps HB's step shape to our step format:
//   HB step.agentOutput.thoughts     → step.thoughts
//   HB step.actions[].actionDescription → step.actions
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { hbPollAgent } from '@/lib/hyperbrowser'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type MappedStep = {
  index: number
  thoughts: string
  actions: string[]
  raw?: unknown
}

function mapSteps(rawSteps: unknown): MappedStep[] {
  if (!Array.isArray(rawSteps)) return []
  return rawSteps.map((s, i) => {
    const step = (s ?? {}) as Record<string, unknown>
    const agentOutput =
      step.agentOutput && typeof step.agentOutput === 'object'
        ? (step.agentOutput as Record<string, unknown>)
        : {}
    const thoughts =
      typeof agentOutput.thoughts === 'string'
        ? agentOutput.thoughts
        : typeof agentOutput.thought === 'string'
          ? agentOutput.thought
          : ''
    const actions = Array.isArray(step.actions)
      ? step.actions
          .map((a) => {
            if (!a || typeof a !== 'object') return ''
            const ao = a as Record<string, unknown>
            return (
              (typeof ao.actionDescription === 'string' &&
                ao.actionDescription) ||
              (typeof ao.description === 'string' && ao.description) ||
              (typeof ao.action === 'string' && ao.action) ||
              ''
            )
          })
          .filter(Boolean)
      : []
    return { index: i, thoughts, actions, raw: step }
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json(
      { ok: false, error: 'missing-id' },
      { status: 400 }
    )
  }

  const result = await hbPollAgent(id)

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, status: result.status },
      {
        status:
          result.status >= 400 && result.status < 600 ? result.status : 502,
      }
    )
  }

  // HB poll response: { status, data:{ steps, finalResult, ... }, ... }
  const raw = (result.data ?? {}) as Record<string, unknown>
  const status =
    typeof raw.status === 'string'
      ? raw.status
      : typeof raw.state === 'string'
        ? raw.state
        : 'unknown'
  const data =
    raw.data && typeof raw.data === 'object'
      ? (raw.data as Record<string, unknown>)
      : raw
  const steps = mapSteps(data.steps)
  const finalResult =
    typeof data.finalResult === 'string'
      ? data.finalResult
      : data.finalResult && typeof data.finalResult === 'object'
        ? JSON.stringify(data.finalResult)
        : ''
  const error =
    typeof raw.error === 'string'
      ? raw.error
      : typeof data.error === 'string'
        ? data.error
        : undefined

  return NextResponse.json({
    ok: true,
    status,
    steps,
    finalResult,
    error,
    liveUrl:
      typeof raw.liveUrl === 'string'
        ? raw.liveUrl
        : typeof data.liveUrl === 'string'
          ? data.liveUrl
          : undefined,
    raw,
  })
}

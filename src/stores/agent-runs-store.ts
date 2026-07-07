// ============================================================
// NEXUS OS — Agent Runs Store
//
// Not persisted. Tracks running/finished agent runs from the
// Command Center and Web Agent apps. Supports step-wise progress,
// approval prompts, and BON (bill of materials / token) accounting.
// ============================================================

import { create } from 'zustand'
import type { AgentRun, AgentRunStatus, AgentStep, AgentStepStatus } from '@/lib/os/types'

let idSeq = 0
function genId(prefix: string): string {
  idSeq += 1
  return `${prefix}_${Date.now().toString(36)}_${idSeq.toString(36)}`
}

type AgentRunsState = {
  runs: AgentRun[]

  startRun: (input: {
    recipe: string
    task: string
    engine: string
    source?: string
    steps?: { label: string }[]
  }) => string

  updateRun: (id: string, patch: Partial<AgentRun>) => void
  addStep: (runId: string, label: string) => string
  updateStep: (runId: string, stepId: string, patch: Partial<AgentStep>) => void
  endRun: (id: string, status: AgentRunStatus, finalResult?: string, error?: string) => void

  requestApproval: (id: string, prompt: string) => void
  approve: (id: string) => void

  clearRuns: () => void
  activeRuns: () => AgentRun[]
  recentRuns: (limit?: number) => AgentRun[]
}

export const useAgentRunsStore = create<AgentRunsState>((set, get) => ({
  runs: [],

  startRun: (input) => {
    const id = genId('run')
    const now = Date.now()
    const steps: AgentStep[] = (input.steps ?? []).map((s, i) => ({
      id: `${id}_s${i}`,
      label: s.label,
      status: 'pending' as AgentStepStatus,
    }))
    const run: AgentRun = {
      id,
      recipe: input.recipe,
      task: input.task,
      engine: input.engine,
      status: 'running',
      startedAt: now,
      steps,
      source: input.source,
    }
    set((s) => ({ runs: [run, ...s.runs] }))
    return id
  },

  updateRun: (id, patch) =>
    set((s) => ({
      runs: s.runs.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),

  addStep: (runId, label) => {
    const stepId = genId('step')
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId
          ? {
              ...r,
              steps: [
                ...r.steps,
                {
                  id: stepId,
                  label,
                  status: 'pending',
                },
              ],
            }
          : r
      ),
    }))
    return stepId
  },

  updateStep: (runId, stepId, patch) =>
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId
          ? {
              ...r,
              steps: r.steps.map((st) =>
                st.id === stepId
                  ? {
                      ...st,
                      ...patch,
                      ...(patch.status === 'running' && !st.startedAt
                        ? { startedAt: Date.now() }
                        : {}),
                      ...(patch.status === 'done' || patch.status === 'error'
                        ? { endedAt: Date.now() }
                        : {}),
                    }
                  : st
              ),
            }
          : r
      ),
    })),

  endRun: (id, status, finalResult, error) =>
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              endedAt: Date.now(),
              ...(finalResult !== undefined ? { finalResult } : {}),
              ...(error !== undefined ? { error } : {}),
            }
          : r
      ),
    })),

  requestApproval: (id, prompt) =>
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === id
          ? { ...r, status: 'awaiting-approval', approvalPrompt: prompt }
          : r
      ),
    })),

  approve: (id) =>
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === id
          ? { ...r, status: 'running', approvalPrompt: undefined }
          : r
      ),
    })),

  clearRuns: () => set({ runs: [] }),

  activeRuns: () =>
    get().runs.filter(
      (r) =>
        r.status === 'running' ||
        r.status === 'pending' ||
        r.status === 'awaiting-approval'
    ),

  recentRuns: (limit = 25) => {
    const all = [...get().runs]
    all.sort((a, b) => b.startedAt - a.startedAt)
    return all.slice(0, limit)
  },
}))

// ============================================================
// NEXUS OS — LLM judge (server-only)
//
// judgeNarratives() asks the default model to compare a set of
// candidate narratives (e.g. scraped-and-synthesized answers) and
// return a structured verdict. Defensive JSON parsing handles
// models that wrap the JSON in prose / fences.
//
// Used by the Command Center / Web Agent pipelines.
// ============================================================

import { askOnce } from './llm'
import { getDefaultModelId } from './models'

export interface NarrativeCandidate {
  id: string
  label?: string
  content: string
}

export interface JudgeScore {
  id: string
  score: number
}

export interface JudgeVerdict {
  winner: string
  reasoning: string
  scores: JudgeScore[]
  /** Raw model output, kept for debugging. */
  raw?: string
}

/**
 * Ask an LLM to judge a set of candidate narratives for a task.
 * Returns { winner, reasoning, scores }. Defensive JSON parse —
 * falls back to a best-effort verdict when the model output isn't
 * valid JSON.
 */
export async function judgeNarratives(
  task: string,
  narratives: NarrativeCandidate[],
  model?: string,
): Promise<JudgeVerdict> {
  if (narratives.length === 0) {
    return { winner: '', reasoning: 'No narratives were provided.', scores: [] }
  }
  if (narratives.length === 1) {
    return {
      winner: narratives[0].id,
      reasoning: 'Only one candidate was provided; defaulting to it.',
      scores: [{ id: narratives[0].id, score: 1 }],
    }
  }

  const numbered = narratives
    .map((n, i) => `### Candidate ${i + 1} (id="${n.id}")${n.label ? ` — ${n.label}` : ''}\n${n.content}`)
    .join('\n\n')

  const prompt = `You are an impartial judge. Compare the candidate narratives below for the given task. Pick the single best candidate and score each from 0 to 100.

TASK:
${task}

CANDIDATES:
${numbered}

Respond with ONLY a JSON object (no prose, no markdown fences) of the shape:
{
  "winner": "<id of the best candidate>",
  "reasoning": "<one or two sentences explaining your choice>",
  "scores": [{ "id": "<candidate id>", "score": <0-100 integer> }]
}`

  const modelId = model && model.trim() ? model : getDefaultModelId()
  let raw = ''
  try {
    raw = await askOnce(prompt, modelId)
  } catch (err) {
    return {
      winner: narratives[0].id,
      reasoning: `Judge model call failed: ${(err as Error).message}`,
      scores: narratives.map((n) => ({ id: n.id, score: 0 })),
      raw,
    }
  }

  const parsed = safeParseJudgeJson(raw, narratives)
  return { ...parsed, raw }
}

/** Try several extraction strategies before giving up. */
function safeParseJudgeJson(
  raw: string,
  narratives: NarrativeCandidate[],
): Omit<JudgeVerdict, 'raw'> {
  const candidates: string[] = []

  // 1. Raw as-is.
  candidates.push(raw)

  // 2. Strip ```json ... ``` fences.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidates.push(fence[1])

  // 3. First {...} block.
  const brace = raw.indexOf('{')
  const braceEnd = raw.lastIndexOf('}')
  if (brace >= 0 && braceEnd > brace) {
    candidates.push(raw.slice(brace, braceEnd + 1))
  }

  for (const candidate of candidates) {
    try {
      const obj = JSON.parse(candidate)
      const winner = typeof obj.winner === 'string' ? obj.winner : ''
      const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : ''
      const scores: JudgeScore[] = Array.isArray(obj.scores)
        ? obj.scores
            .map((s: { id?: unknown; score?: unknown }) => ({
              id: typeof s?.id === 'string' ? s.id : '',
              score: typeof s?.score === 'number' ? s.score : 0,
            }))
            .filter((s: JudgeScore) => s.id)
        : []
      // Validate winner is a known id; otherwise pick the first candidate.
      const knownIds = new Set(narratives.map((n) => n.id))
      const safeWinner = knownIds.has(winner) ? winner : narratives[0].id
      return { winner: safeWinner, reasoning, scores }
    } catch {
      // try next candidate
    }
  }

  return {
    winner: narratives[0].id,
    reasoning: 'Judge output was not valid JSON; defaulted to first candidate.',
    scores: narratives.map((n) => ({ id: n.id, score: 0 })),
  }
}

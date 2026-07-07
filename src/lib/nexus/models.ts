// ============================================================
// NEXUS OS — model catalogue facade
//
// Thin wrapper around providers/index.ts so callers don't need to
// know about the registry layer. Re-exported by api/ai/models.
// ============================================================

import type { ModelOption } from './types'
import { listAllModels, getDefaultModel } from './providers/index'

export function getModels(): ModelOption[] {
  return listAllModels()
}

export { getDefaultModel }

export function getDefaultModelId(): string {
  return getDefaultModel().id
}

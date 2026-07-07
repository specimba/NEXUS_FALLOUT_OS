// ============================================================
// NEXUS OS — /api/ai/models
//
// GET → { count, available, default, models }
// ============================================================

import { NextResponse } from 'next/server'
import { getModels, getDefaultModelId } from '@/lib/nexus/models'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET() {
  const models = getModels()
  return NextResponse.json({
    count: models.length,
    available: models.filter((m) => m.available).length,
    default: getDefaultModelId(),
    models,
  })
}

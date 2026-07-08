import { NextResponse } from 'next/server'
import { CATALOG, PROVIDERS } from '@/lib/nexus/providers'

// GET /api/nexus/models — full catalog with provider availability.
//
// Returns:
//   {
//     providers: Provider[],
//     models: CatalogModel[]  // each model carries its provider's availability
//   }
export async function GET() {
  return NextResponse.json({
    providers: PROVIDERS,
    models: CATALOG,
  })
}

import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { guard, ok } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

/**
 * How much PACT is actually being used.
 *
 * Open rather than gated, because every number it returns is an aggregate over rows that
 * already exist, and none of them says anything about an individual: how many agreements
 * exist, how many got signed, how many people have used it, how much has settled. There
 * is nothing here to protect that isn't already public in aggregate, and gating it behind
 * an admin login would imply otherwise.
 *
 * There is no event tracking behind this. PACT does not record page views, sessions, or
 * who opened what — these are `count(*)`s over the product's own data.
 */
export async function GET(): Promise<NextResponse> {
  return guard(async () => {
    const stats = await getRepository().getProductStats()
    return ok({ stats })
  })
}

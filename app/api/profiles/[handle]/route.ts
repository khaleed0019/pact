import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, fail, ok } from '@/lib/api/handler'
import { HANDLE_PATTERN, normalizeHandle } from '@/lib/pact/handles'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ handle: string }> }

/**
 * A contributor's profile by handle: name, categories, links, and a record made only of
 * counts PACT can evidence — with denominators. No agreement titles, amounts or
 * counterparties: those belong to the people in each agreement.
 */
export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  return authed(async () => {
    const handle = normalizeHandle((await context.params).handle)
    if (!HANDLE_PATTERN.test(handle)) return fail('INVITE_INVALID', 404, 'No one uses that handle.')
    const repo = getRepository()
    const profile = await repo.findProfileByHandle(handle)
    if (!profile) return fail('INVITE_INVALID', 404, 'No one uses that handle.')
    const trust = await repo.getTrustMetrics(profile.address)
    return ok({
      profile,
      record: {
        pactsCompleted: trust.pactsCompleted,
        deliveredOnTime: trust.deliveredOnTime,
        deliveredTotal: trust.deliveredTotal,
        paymentsConfirmed: trust.paymentsConfirmed,
        firstSeenAt: trust.firstSeenAt,
      },
    })
  })
}

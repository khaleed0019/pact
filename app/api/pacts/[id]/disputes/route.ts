import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, ok } from '@/lib/api/handler'
import { disputeSchema } from '@/lib/api/schema'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'
import { DISPUTE_REASON_META } from '@/lib/pact/state'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Raise an issue.
 *
 * Two writes that have to happen together: the dispute row (what's wrong, in the
 * raiser's words) and the pact's status. The dispute goes first — if the status change
 * is rejected by the state machine, we'd rather have no dispute than a dispute nobody's
 * agreement points at.
 *
 * PACT does not arbitrate. This records that someone objected, what they said, and when.
 * Nothing here moves money, reverses a payment, or decides who is right.
 */
export async function POST(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const input = await body(request, disputeSchema)

    const pact = await loadPact(id)
    const viewer = viewerOf(pact, session.address)

    const repo = getRepository()
    const dispute = await repo.raiseDispute({
      pactId: id,
      raisedBy: session.address,
      reason: input.reason,
      detail: input.detail,
    })

    // Already DISPUTED means a previous issue was raised and never closed — the
    // one-open-per-pact index would have refused above, so this is the re-raise case
    // after a resolution, and the status still needs moving.
    if (pact.status !== 'DISPUTED') {
      await repo.setStatus(id, session.address, 'DISPUTED')
    }

    await repo.addActivity({
      pactId: id,
      kind: 'ISSUE_RAISED',
      actorAddress: session.address,
      actorName: viewer.displayName,
      summary: `${viewer.displayName} raised an issue: ${DISPUTE_REASON_META[input.reason].label.toLowerCase()}`,
      meta: { reason: input.reason },
    })

    return ok({ dispute, pact: await repo.getPactById(id) }, 201)
  })
}

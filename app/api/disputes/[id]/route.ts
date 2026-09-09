import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, ok } from '@/lib/api/handler'
import { resolveDisputeSchema } from '@/lib/api/schema'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Close an issue out.
 *
 * `RESOLVED` is "we sorted it out"; `WITHDRAWN` is "I take it back", and only the raiser
 * may do that (enforced in the repository, not here). Either way the agreement returns to
 * IN_PROGRESS, which is the state machine's only "carry on" edge out of DISPUTED — the
 * two of them still have to actually deliver and confirm from there, which is the point.
 */
export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const { status } = await body(request, resolveDisputeSchema)

    const repo = getRepository()
    const dispute = await repo.resolveDispute({ disputeId: id, actor: session.address, status })

    const pact = await loadPact(dispute.pactId)
    const viewer = viewerOf(pact, session.address)

    if (pact.status === 'DISPUTED') {
      await repo.setStatus(dispute.pactId, session.address, 'IN_PROGRESS')
    }

    await repo.addActivity({
      pactId: dispute.pactId,
      kind: 'ISSUE_RESOLVED',
      actorAddress: session.address,
      actorName: viewer.displayName,
      summary:
        status === 'WITHDRAWN'
          ? `${viewer.displayName} withdrew the issue`
          : `${viewer.displayName} marked the issue resolved`,
    })

    return ok({ dispute, pact: await repo.getPactById(dispute.pactId) })
  })
}

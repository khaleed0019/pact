import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, ok } from '@/lib/api/handler'
import { reviewSchema } from '@/lib/api/schema'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Review a delivery: approve it, or say what needs changing.
 *
 * Approving does not complete the pact on its own. The client still has to pay whatever
 * is outstanding, and PACT will not pretend money moved because a box was ticked.
 */
export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const input = await body(request, reviewSchema)

    const repo = getRepository()
    const deliverable = await repo.reviewDeliverable({
      deliverableId: id,
      actor: session.address,
      status: input.status,
      reviewNote: input.reviewNote,
    })

    const pact = await loadPact(deliverable.pactId)
    const viewer = viewerOf(pact, session.address)

    await repo.addActivity({
      pactId: pact.id,
      kind: input.status === 'APPROVED' ? 'DELIVERY_APPROVED' : 'CHANGES_REQUESTED',
      actorAddress: session.address,
      actorName: viewer.displayName,
      summary:
        input.status === 'APPROVED'
          ? `${viewer.displayName} approved the delivery`
          : `${viewer.displayName} asked for changes`,
      meta: { note: input.reviewNote?.slice(0, 160) ?? null },
    })

    // Changes requested sends the work back rather than leaving the pact stuck at DELIVERED.
    if (input.status === 'CHANGES_REQUESTED' && pact.status === 'DELIVERED') {
      await repo.setStatus(pact.id, session.address, 'IN_PROGRESS')
    }

    return ok({ deliverable, pact: await repo.getPactById(pact.id) })
  })
}

import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, ok } from '@/lib/api/handler'
import { negotiationSchema } from '@/lib/api/schema'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Propose changes.
 *
 * Each change records both the original and the proposed value, which is what lets the
 * UI render a real before/after diff instead of a message saying "can we change the
 * date?" that the other person has to interpret.
 *
 * Opening a proposal also moves the pact to NEGOTIATING, so the state and the
 * conversation cannot disagree about whether something is still under discussion.
 */
export async function POST(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const input = await body(request, negotiationSchema)

    const pact = await loadPact(id)
    const viewer = viewerOf(pact, session.address)

    const repo = getRepository()
    const negotiation = await repo.openNegotiation({
      pactId: id,
      proposedBy: session.address,
      message: input.message,
      changes: input.changes,
    })

    if (pact.status === 'PENDING' || pact.status === 'DRAFT') {
      await repo.setStatus(id, session.address, 'NEGOTIATING')
    }

    await repo.addActivity({
      pactId: id,
      kind: 'CHANGES_REQUESTED',
      actorAddress: session.address,
      actorName: viewer.displayName,
      summary: `${viewer.displayName} proposed ${input.changes.length} change${input.changes.length === 1 ? '' : 's'}`,
      meta: { changes: input.changes.map((c) => c.label).join(', ') },
    })

    return ok({ negotiation, pact: await repo.getPactById(id) }, 201)
  })
}

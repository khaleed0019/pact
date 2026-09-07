import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, ok } from '@/lib/api/handler'
import { deliverableSchema } from '@/lib/api/schema'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const input = await body(request, deliverableSchema)

    const pact = await loadPact(id)
    const viewer = viewerOf(pact, session.address)

    const repo = getRepository()
    // The repository enforces that only the provider can submit; the role is read from
    // storage, so this cannot be bypassed by sending a different role in the body.
    const deliverable = await repo.submitDeliverable({
      pactId: id,
      milestoneId: input.milestoneId,
      submittedBy: session.address,
      note: input.note,
      link: input.link,
    })

    if (pact.status === 'ACTIVE' || pact.status === 'IN_PROGRESS') {
      await repo.setStatus(id, session.address, pact.status === 'ACTIVE' ? 'IN_PROGRESS' : 'DELIVERED')
    }

    await repo.addActivity({
      pactId: id,
      kind: 'DELIVERY_SUBMITTED',
      actorAddress: session.address,
      actorName: viewer.displayName,
      summary: `${viewer.displayName} submitted a delivery`,
      meta: { note: input.note.slice(0, 120), link: input.link },
    })

    return ok({ deliverable, pact: await repo.getPactById(id) }, 201)
  })
}

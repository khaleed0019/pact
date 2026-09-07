import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, ok } from '@/lib/api/handler'
import { lifecycleSchema } from '@/lib/api/schema'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'
import type { ActivityKind, PactStatus } from '@/lib/pact/types'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Every lifecycle move goes through here.
 *
 * The repository re-checks the transition against the state machine using the caller's
 * *stored* role, so a client that fabricates a request for a step it is not entitled to
 * gets a 409 or 403 rather than a state change. The UI hiding a button is a convenience,
 * not the control.
 */
const NARRATION: Partial<Record<PactStatus, { kind: ActivityKind; summary: (name: string) => string }>> = {
  PENDING: { kind: 'PACT_SENT', summary: (name) => `${name} sent this for signature` },
  IN_PROGRESS: { kind: 'WORK_STARTED', summary: (name) => `${name} started work` },
  DELIVERED: { kind: 'DELIVERY_SUBMITTED', summary: (name) => `${name} marked the work delivered` },
  COMPLETED: { kind: 'PACT_COMPLETED', summary: () => 'Agreement completed' },
  CANCELLED: { kind: 'PACT_CANCELLED', summary: (name) => `${name} cancelled this agreement` },
  DECLINED: { kind: 'PACT_DECLINED', summary: (name) => `${name} declined this agreement` },
  DISPUTED: { kind: 'ISSUE_RAISED', summary: (name) => `${name} raised an issue` },
}

export async function POST(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const { status } = await body(request, lifecycleSchema)

    const pact = await loadPact(id)
    const viewer = viewerOf(pact, session.address)

    const repo = getRepository()
    const updated = await repo.setStatus(id, session.address, status)

    const narration = NARRATION[status]
    if (narration && pact.status !== status) {
      await repo.addActivity({
        pactId: id,
        kind: narration.kind,
        actorAddress: session.address,
        actorName: viewer.displayName,
        summary: narration.summary(viewer.displayName),
      })
    }

    return ok({ pact: await repo.getPactById(id) ?? updated })
  })
}

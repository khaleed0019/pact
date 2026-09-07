import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, fail, ok } from '@/lib/api/handler'
import { resolveNegotiationSchema } from '@/lib/api/schema'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'
import { toMinor } from '@/lib/pact/money'
import type { UpdateTermsInput } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Answer a proposal.
 *
 * Accepting is the interesting case: it does not just mark a row accepted, it *applies*
 * the proposed values to the terms. That in turn moves the fingerprint, which clears both
 * signatures — so after accepting changes, both parties have to sign again. That is the
 * correct behaviour and the whole point of tying signatures to a digest: nobody stays
 * bound to terms they did not see.
 *
 * Only fields PACT knows how to apply are applied. An accepted change to some free-text
 * field it cannot map is recorded on the timeline rather than silently ignored.
 */
const APPLICABLE = new Set(['deadline', 'totalAmount', 'paymentCondition', 'title', 'deliverable'])

export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const { status } = await body(request, resolveNegotiationSchema)

    const repo = getRepository()
    const resolved = await repo.resolveNegotiation({ negotiationId: id, actor: session.address, status })

    const pact = await loadPact(resolved.pactId)
    const viewer = viewerOf(pact, session.address)

    if (status === 'ACCEPTED') {
      const patch: UpdateTermsInput = {}
      const unmapped: string[] = []

      for (const change of resolved.changes) {
        switch (change.field) {
          case 'deadline':
            patch.deadline = change.proposedValue || null
            break
          case 'totalAmount':
            try {
              patch.totalAmountMinor = toMinor(change.proposedValue, pact.currency)
            } catch {
              return fail('VALIDATION', 422, 'The proposed amount is not a valid number.')
            }
            break
          case 'paymentCondition':
            patch.paymentCondition = change.proposedValue
            break
          case 'title':
            patch.title = change.proposedValue
            break
          case 'deliverable':
            patch.deliverable = change.proposedValue
            break
          default:
            if (!APPLICABLE.has(change.field)) unmapped.push(change.label)
        }
      }

      if (Object.keys(patch).length > 0) await repo.updateTerms(pact.id, session.address, patch)

      await repo.addActivity({
        pactId: pact.id,
        kind: 'CHANGES_ACCEPTED',
        actorAddress: session.address,
        actorName: viewer.displayName,
        summary: `${viewer.displayName} accepted the proposed changes`,
        meta: {
          applied: resolved.changes.map((c) => c.label).join(', '),
          // Both parties must sign again, and the timeline says so explicitly.
          note: 'Terms changed — both sides need to sign again.',
          ...(unmapped.length > 0 ? { manual: `Agreed in conversation: ${unmapped.join(', ')}` } : {}),
        },
      })

      // Back to PENDING: there is a fresh set of terms waiting on two signatures.
      if (pact.status === 'NEGOTIATING') await repo.setStatus(pact.id, session.address, 'PENDING')
    } else if (status === 'DECLINED') {
      await repo.addActivity({
        pactId: pact.id,
        kind: 'CHANGES_REQUESTED',
        actorAddress: session.address,
        actorName: viewer.displayName,
        summary: `${viewer.displayName} turned down the proposed changes`,
      })
    }

    return ok({ negotiation: resolved, pact: await repo.getPactById(pact.id) })
  })
}

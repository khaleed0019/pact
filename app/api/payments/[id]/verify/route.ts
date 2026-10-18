import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, fail, ok } from '@/lib/api/handler'
import { loadPact } from '@/lib/api/pact-helpers'
import { reconcilePayment, verifierConfig } from '@/lib/api/reconcile'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Context = { params: Promise<{ id: string }> }

/**
 * Ask PACT to check a submitted payment against the chain.
 *
 * Either party may ask, and asking twice is harmless: a settled payment is returned as
 * it is, and a still-pending one is simply looked at again. The caller learns what the
 * network said; it does not get to say what the network should have said.
 */
export async function POST(_request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const repo = getRepository()

    const existing = await repo.getPaymentById(id)
    if (!existing) return fail('INVITE_INVALID', 404, 'That payment does not exist.')

    const pact = await loadPact(existing.pactId)
    const isParty = pact.participants.some((p) => p.address === session.address)
    if (!isParty) return fail('NOT_ALLOWED', 403, 'Only people in this agreement can check its payments.')

    const { payment, outcome } = await reconcilePayment(repo, id, verifierConfig())
    return ok({
      payment,
      verification: outcome && {
        state: outcome.state,
        reason: 'reason' in outcome ? outcome.reason : undefined,
      },
      pact: await repo.getPactById(pact.id),
    })
  })
}

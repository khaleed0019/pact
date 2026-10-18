import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, fail, ok } from '@/lib/api/handler'
import { paymentStatusSchema } from '@/lib/api/schema'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'
import { reconcilePayment, verifierConfig } from '@/lib/api/reconcile'
import { formatWithCurrency } from '@/lib/pact/money'
import { normalizeAddress } from '@/lib/nimiq/address'
import type { ActivityKind } from '@/lib/pact/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Context = { params: Promise<{ id: string }> }

/**
 * Report what happened on the payer's side: sent, failed, or cancelled.
 *
 * What a payer can tell us is limited to what only they know — the wallet handed back a
 * reference (SUBMITTED), or it did not (FAILED / CANCELLED). Whether that reference is a
 * real payment of the right amount to the right person is not theirs to assert, so
 * **`CONFIRMED` is refused here outright.** It is written by `reconcilePayment`, after
 * reading the network, and nowhere else.
 *
 * Reporting SUBMITTED triggers one verification attempt straight away, so a payment that
 * is already visible on the chain confirms without a second request.
 */
const NARRATION: Record<string, { kind: ActivityKind; verb: string }> = {
  SUBMITTED: { kind: 'PAYMENT_INITIATED', verb: 'sent' },
  FAILED: { kind: 'PAYMENT_FAILED', verb: 'tried to pay' },
  CANCELLED: { kind: 'PAYMENT_FAILED', verb: 'cancelled a payment of' },
}

export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const input = await body(request, paymentStatusSchema)

    if (input.status === 'CONFIRMED') {
      return fail(
        'NOT_ALLOWED',
        403,
        'A payment is confirmed by the network, not by the app. Ask for a check and PACT will read the chain itself.',
      )
    }

    if (input.status === 'SUBMITTED' && !input.txReference) {
      return fail('VALIDATION', 422, 'A payment can only be marked sent with a transaction reference.')
    }

    const repo = getRepository()

    // Authorise before writing: the caller must be the person who sent this payment.
    const existing = await repo.getPaymentById(id)
    if (!existing) return fail('INVITE_INVALID', 404, 'That payment does not exist.')

    const pact = await loadPact(existing.pactId)
    const viewer = viewerOf(pact, session.address)

    if (normalizeAddress(existing.fromAddress) !== normalizeAddress(session.address)) {
      return fail('NOT_ALLOWED', 403, 'Only the person who sent this payment can update it.')
    }

    let updated = await repo.updatePaymentStatus({
      paymentId: id,
      status: input.status,
      txReference: input.txReference,
      failureReason: input.failureReason,
    })

    const narration = NARRATION[input.status]
    await repo.addActivity({
      pactId: pact.id,
      kind: narration.kind,
      actorAddress: session.address,
      actorName: viewer.displayName,
      summary: `${viewer.displayName} ${narration.verb} ${formatWithCurrency(updated.amountMinor, updated.currency)}`,
      meta: {
        amount: formatWithCurrency(updated.amountMinor, updated.currency),
        reference: updated.txReference,
        reason: updated.failureReason,
      },
    })

    let verification: { state: string; reason?: string } | null = null
    if (input.status === 'SUBMITTED') {
      const result = await reconcilePayment(repo, id, verifierConfig())
      updated = result.payment
      verification = result.outcome && {
        state: result.outcome.state,
        reason: 'reason' in result.outcome ? result.outcome.reason : undefined,
      }
    }

    return ok({ payment: updated, verification, pact: await repo.getPactById(pact.id) })
  })
}

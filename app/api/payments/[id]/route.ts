import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, fail, ok } from '@/lib/api/handler'
import { paymentStatusSchema } from '@/lib/api/schema'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'
import { formatWithCurrency } from '@/lib/pact/money'
import { normalizeAddress } from '@/lib/nimiq/address'
import type { ActivityKind } from '@/lib/pact/types'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Move a payment along: submitted, confirmed, failed, or cancelled.
 *
 * The honesty rule lives here. `CONFIRMED` requires a transaction reference — the wallet
 * actually handed back a transaction. Without one, the request is refused. That is what
 * stops a bug (or a client) from marking money as paid when nothing left the wallet.
 *
 * Cancellation is treated as a normal outcome. It records that the user chose not to
 * proceed and leaves the milestone exactly where it was.
 */
const NARRATION: Record<string, { kind: ActivityKind; verb: string }> = {
  SUBMITTED: { kind: 'PAYMENT_INITIATED', verb: 'sent' },
  CONFIRMED: { kind: 'PAYMENT_CONFIRMED', verb: 'paid' },
  FAILED: { kind: 'PAYMENT_FAILED', verb: 'tried to pay' },
  CANCELLED: { kind: 'PAYMENT_FAILED', verb: 'cancelled a payment of' },
}

export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const input = await body(request, paymentStatusSchema)

    const repo = getRepository()

    if ((input.status === 'SUBMITTED' || input.status === 'CONFIRMED') && !input.txReference) {
      return fail('VALIDATION', 422, 'A payment can only be marked sent or confirmed with a transaction reference.')
    }

    // Authorise before writing. Loading the payment first lets us confirm the caller is
    // a party to its pact *and* the one who sent it — checking after the update would
    // mean an unauthorised request had already changed the record.
    const existing = await repo.getPaymentById(id)
    if (!existing) return fail('INVITE_INVALID', 404, 'That payment does not exist.')

    const pact = await loadPact(existing.pactId)
    const viewer = viewerOf(pact, session.address)

    if (normalizeAddress(existing.fromAddress) !== normalizeAddress(session.address)) {
      return fail('NOT_ALLOWED', 403, 'Only the person who sent this payment can update it.')
    }

    const updated = await repo.updatePaymentStatus({
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

    // A milestone is only marked PAID once its payment is confirmed, never on submission.
    if (input.status === 'CONFIRMED' && updated.milestoneId) {
      await repo.setMilestoneStatus(pact.id, updated.milestoneId, 'PAID')
      await repo.addActivity({
        pactId: pact.id,
        kind: 'MILESTONE_COMPLETED',
        actorAddress: null,
        actorName: 'PACT',
        summary: `${pact.milestones.find((m) => m.id === updated.milestoneId)?.title ?? 'Milestone'} is paid`,
      })
    }

    return ok({ payment: updated, pact: await repo.getPactById(pact.id) })
  })
}

import { isRepoError, type Repository } from '../db/repo.ts'
import { DEFAULT_CONFIG, verifyPayment, type Expectation, type VerifierConfig, type VerifyOutcome } from '../nimiq/verifyPayment.ts'
import { formatWithCurrency } from '../pact/money.ts'
import type { PactDetail, Payment } from '../pact/types.ts'

/**
 * Decide what a payment actually is, by asking the chain.
 *
 * This is the only place `CONFIRMED` is ever written. The routes can record that a payer
 * *says* they sent something (SUBMITTED, with the reference the wallet gave them), but
 * whether that is a real payment of the right size to the right person is not a thing a
 * client gets to assert — it is read off the network here and nowhere else.
 *
 * No `server-only` import and no framework types, so the whole decision runs under the
 * test runner against a fake chain.
 */

export function verifierConfig(): VerifierConfig {
  return {
    ...DEFAULT_CONFIG,
    nimiqRpcUrl: process.env.NIMIQ_RPC_URL || DEFAULT_CONFIG.nimiqRpcUrl,
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  }
}

export interface Reconciliation {
  payment: Payment
  outcome: VerifyOutcome | null
}

/** What the agreement requires this payment to look like on the chain. */
export function expectationFor(pact: PactDetail, payment: Payment): Expectation | { missing: string } {
  if (payment.currency === 'NIM') {
    return { currency: 'NIM', to: payment.toAddress, amountMinor: payment.amountMinor, memo: payment.memo }
  }

  const provider = pact.participants.find((p) => p.role === 'PROVIDER')
  if (!provider?.evmAddress || !payment.chain) {
    return { missing: 'The recipient has not shared a USDT address yet, so there is nothing to check this payment against.' }
  }
  return { currency: 'USDT', chain: payment.chain, toEvm: provider.evmAddress, amountMinor: payment.amountMinor }
}

export async function reconcilePayment(
  repo: Repository,
  paymentId: string,
  config: VerifierConfig,
): Promise<Reconciliation> {
  const payment = await repo.getPaymentById(paymentId)
  if (!payment) throw new Error('payment not found')

  // Settled payments are final. Re-checking one must neither re-narrate it nor disturb it.
  if (payment.status !== 'SUBMITTED' || !payment.txReference) {
    return { payment, outcome: null }
  }

  const pact = await repo.getPactById(payment.pactId)
  if (!pact) throw new Error('pact not found')

  const expected = expectationFor(pact, payment)
  if ('missing' in expected) {
    return { payment, outcome: { state: 'PENDING', reason: expected.missing } }
  }

  const outcome = await verifyPayment(payment.txReference, expected, config)
  const amount = formatWithCurrency(payment.amountMinor, payment.currency)

  if (outcome.state === 'PENDING') return { payment, outcome }

  if (outcome.state === 'REJECTED') {
    const failed = await repo.updatePaymentStatus({
      paymentId,
      status: 'FAILED',
      failureReason: outcome.reason.slice(0, 280),
    })
    await repo.addActivity({
      pactId: pact.id,
      kind: 'PAYMENT_FAILED',
      actorAddress: null,
      actorName: 'PACT',
      summary: `A payment of ${amount} could not be matched to this agreement`,
      meta: { amount, reason: outcome.reason, reference: payment.txReference },
    })
    return { payment: failed, outcome }
  }

  // CONFIRMED by the chain. The canonical hash replaces whatever the wallet handed back —
  // it may have been a serialized transaction — so what gets stored is what can be looked
  // up on any explorer.
  let confirmed: Payment
  try {
    confirmed = await repo.updatePaymentStatus({ paymentId, status: 'CONFIRMED', txReference: outcome.txHash })
  } catch (cause) {
    if (!isRepoError(cause) || cause.kind !== 'CONFLICT') throw cause

    // Either another request confirmed this payment a moment ago (fine — return what is
    // stored), or this transaction already settled a *different* payment (not fine, and
    // not something to quietly confirm twice).
    const latest = await repo.getPaymentById(paymentId)
    if (latest?.status === 'CONFIRMED') return { payment: latest, outcome }

    const reason = 'That transaction has already been used to settle a different payment.'
    const failed = await repo.updatePaymentStatus({ paymentId, status: 'FAILED', failureReason: reason })
    await repo.addActivity({
      pactId: pact.id,
      kind: 'PAYMENT_FAILED',
      actorAddress: null,
      actorName: 'PACT',
      summary: `A payment of ${amount} reused a transaction that had already settled another`,
      meta: { amount, reason },
    })
    return { payment: failed, outcome: { state: 'REJECTED', reason } }
  }

  await repo.addActivity({
    pactId: pact.id,
    kind: 'PAYMENT_CONFIRMED',
    // The network confirmed this, not a person — attributing it to either party would be
    // the same self-reporting the verifier exists to remove.
    actorAddress: null,
    actorName: 'PACT',
    summary: `Payment of ${amount} confirmed on the network`,
    meta: { amount, reference: outcome.txHash, confirmations: outcome.confirmations },
  })

  if (confirmed.milestoneId) {
    await repo.setMilestoneStatus(pact.id, confirmed.milestoneId, 'PAID')
    await repo.addActivity({
      pactId: pact.id,
      kind: 'MILESTONE_COMPLETED',
      actorAddress: null,
      actorName: 'PACT',
      summary: `${pact.milestones.find((m) => m.id === confirmed.milestoneId)?.title ?? 'Milestone'} is paid`,
    })
  }

  return { payment: confirmed, outcome }
}

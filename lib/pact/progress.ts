import { usesPayment } from './categories.ts'
import { sumMinor } from './money.ts'
import type { PactDetail } from './types.ts'

export type StepState = 'done' | 'current' | 'upcoming' | 'attention'

export interface Step {
  key: string
  label: string
  detail: string
  state: StepState
  at: string | null
}

/**
 * Where this agreement actually is, as a stepper.
 *
 * Every step is derived from stored rows — signatures, deliveries, reviews, payments — and
 * nothing is shown as done because it is "next". The last step is the network's
 * confirmation, not the payer's send: a payment that has left a wallet but has not been
 * found on the chain sits on "Sent", visibly short of "Verified".
 *
 * Exported for tests as `progressOf`.
 */
export function progressOf(pact: PactDetail): Step[] {
  const sealedAll = pact.participants.length > 0 && pact.participants.every((p) => p.sealSignature)
  const sealedAt = sealedAll
    ? pact.participants.map((p) => p.sealedAt ?? '').sort().at(-1) || null
    : null
  const deliveries = [...pact.deliverables].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const latest = deliveries.at(-1) ?? null
  const approved = deliveries.filter((d) => d.status === 'APPROVED').at(-1) ?? null
  // Seeded demo payments (`demo:` references) are examples with no transaction behind
  // them, so they never count as sent or verified here.
  const real = pact.payments.filter((p) => !p.txReference?.startsWith('demo:'))
  const demoOnly = real.length === 0 && pact.payments.length > 0
  const sent = real.filter((p) => p.status === 'SUBMITTED' || p.status === 'CONFIRMED')
  const confirmed = real.filter((p) => p.status === 'CONFIRMED')
  const failed = real.filter((p) => p.status === 'FAILED')
  const confirmedTotal = confirmed.length ? sumMinor(confirmed.map((p) => p.amountMinor)) : '0'
  const fullyPaid = BigInt(confirmedTotal) >= BigInt(pact.totalAmountMinor) && BigInt(pact.totalAmountMinor) > 0n
  const stopped = pact.status === 'DECLINED' || pact.status === 'CANCELLED'

  const steps: Step[] = [
    { key: 'terms', label: 'Terms written', detail: 'The agreement exists', state: 'done', at: pact.createdAt },
    {
      key: 'signed',
      label: 'Both signed',
      detail: sealedAll
        ? 'Each side signed these exact terms'
        : `${pact.participants.filter((p) => p.sealSignature).length} of ${pact.participants.length} signatures`,
      state: sealedAll ? 'done' : stopped ? 'upcoming' : 'current',
      at: sealedAt,
    },
    {
      key: 'submitted',
      label: 'Work submitted',
      detail: latest ? `${deliveries.length} ${deliveries.length === 1 ? 'delivery' : 'deliveries'}` : 'Nothing submitted yet',
      state: latest ? 'done' : sealedAll && !stopped ? 'current' : 'upcoming',
      at: latest?.createdAt ?? null,
    },
    {
      key: 'reviewed',
      label: latest?.status === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Approved',
      detail:
        latest?.status === 'CHANGES_REQUESTED'
          ? latest.reviewNote || 'Sent back with changes to make'
          : approved
            ? 'The work was approved'
            : latest
              ? 'Waiting for review'
              : 'After work is submitted',
      state: latest?.status === 'CHANGES_REQUESTED' ? 'attention' : approved ? 'done' : latest ? 'current' : 'upcoming',
      at: latest?.status === 'CHANGES_REQUESTED' ? latest.updatedAt : approved?.updatedAt ?? null,
    },
  ]

  if (usesPayment(pact.category)) {
    steps.push(
      {
        key: 'sent',
        label: 'Payment sent',
        detail: demoOnly ? 'Demo data — no real payment exists' : sent.length ? 'The wallet sent it' : 'Paid from the agreement in Nimiq Pay',
        state: sent.length ? 'done' : approved ? 'current' : 'upcoming',
        at: sent.at(-1)?.createdAt ?? null,
      },
      {
        key: 'verified',
        label: 'Verified on the network',
        detail: fullyPaid
          ? 'Found on the chain, for the agreed amount'
          : confirmed.length
            ? 'Part paid — more to come'
            : sent.length
              ? 'Waiting for the network to confirm'
              : failed.length
                ? 'A payment didn’t match the agreement — see Payments'
              : 'Only the network can confirm a payment',
        state: fullyPaid ? 'done' : sent.length ? 'current' : failed.length ? 'attention' : 'upcoming',
        at: confirmed.at(-1)?.updatedAt ?? null,
      },
    )
  }
  return steps
}

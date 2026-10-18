import type { PaymentStatus } from './types.ts'

/**
 * The lifecycle of one payment, as a pure function.
 *
 *   PENDING ──► SUBMITTED ──► CONFIRMED
 *      │            │
 *      │            └──────► FAILED
 *      ├─────────────────► FAILED
 *      └─────────────────► CANCELLED
 *
 * CONFIRMED, FAILED and CANCELLED are terminal.
 *
 * The edge that matters is the one that is missing: **PENDING cannot become CONFIRMED.**
 * A payment has to pass through SUBMITTED, which requires a transaction reference, before
 * anything can confirm it — and CONFIRMED is only ever written by the server after it has
 * looked at the chain (see lib/api/payments.ts), never because a client asked for it.
 *
 * And the edge that must never exist: nothing leaves CONFIRMED. Before this, any status
 * could be written over any other, so a confirmed payment could later be flipped to
 * FAILED — and a party who owed money had every reason to do exactly that.
 *
 * A failed or cancelled attempt is not retried in place. Paying again is a new payment
 * with its own idempotency key, which keeps every attempt on the record.
 */
const GRAPH: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ['SUBMITTED', 'FAILED', 'CANCELLED'],
  // A submitted payment can only resolve one of two ways: the chain shows it, or it
  // turned out not to be this payment. It cannot be "cancelled" — it already left.
  SUBMITTED: ['CONFIRMED', 'FAILED'],
  CONFIRMED: [],
  FAILED: [],
  CANCELLED: [],
}

export function canPaymentTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return GRAPH[from].includes(to)
}

export function isSettled(status: PaymentStatus): boolean {
  return GRAPH[status].length === 0
}

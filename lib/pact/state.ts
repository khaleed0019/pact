import type { DisputeReason, PactStatus, ParticipantRole } from './types.ts'

/**
 * The pact lifecycle, as a pure function.
 *
 * The client imports this to decide which buttons to render. The server imports the
 * same function to decide whether a mutation is legal. There is deliberately only one
 * copy — a UI that hides a button is a hint, not a security boundary, and the two must
 * not be allowed to drift apart.
 */

export type Actor = ParticipantRole | 'SYSTEM'

interface Transition {
  to: PactStatus
  /** Who is allowed to trigger it. SYSTEM covers automatic, non-user transitions. */
  by: Actor[]
}

const GRAPH: Record<PactStatus, Transition[]> = {
  DRAFT: [
    { to: 'PENDING', by: ['CLIENT', 'PROVIDER'] }, // whoever drafted it sends it
    { to: 'CANCELLED', by: ['CLIENT', 'PROVIDER'] },
  ],
  PENDING: [
    { to: 'ACTIVE', by: ['CLIENT', 'PROVIDER'] }, // counterparty accepts + seals
    { to: 'NEGOTIATING', by: ['CLIENT', 'PROVIDER'] },
    { to: 'DECLINED', by: ['CLIENT', 'PROVIDER'] },
    { to: 'CANCELLED', by: ['CLIENT', 'PROVIDER'] },
  ],
  NEGOTIATING: [
    { to: 'PENDING', by: ['CLIENT', 'PROVIDER'] }, // countered, back to the other side
    { to: 'ACTIVE', by: ['CLIENT', 'PROVIDER'] }, // changes accepted and sealed
    { to: 'DECLINED', by: ['CLIENT', 'PROVIDER'] },
    { to: 'CANCELLED', by: ['CLIENT', 'PROVIDER'] },
  ],
  ACTIVE: [
    { to: 'IN_PROGRESS', by: ['PROVIDER'] },
    { to: 'DISPUTED', by: ['CLIENT', 'PROVIDER'] },
    { to: 'CANCELLED', by: ['CLIENT', 'PROVIDER'] },
  ],
  IN_PROGRESS: [
    { to: 'DELIVERED', by: ['PROVIDER'] },
    { to: 'DISPUTED', by: ['CLIENT', 'PROVIDER'] },
    { to: 'CANCELLED', by: ['CLIENT', 'PROVIDER'] },
  ],
  DELIVERED: [
    { to: 'COMPLETED', by: ['CLIENT'] },
    { to: 'IN_PROGRESS', by: ['CLIENT'] }, // changes requested, back to work
    { to: 'DISPUTED', by: ['CLIENT', 'PROVIDER'] },
  ],
  // Terminal, except that a dispute can be worked out.
  COMPLETED: [],
  DISPUTED: [
    { to: 'IN_PROGRESS', by: ['CLIENT', 'PROVIDER'] },
    { to: 'COMPLETED', by: ['CLIENT'] },
    { to: 'CANCELLED', by: ['CLIENT', 'PROVIDER'] },
  ],
  DECLINED: [],
  CANCELLED: [],
}

export function canTransition(from: PactStatus, to: PactStatus, actor: Actor): boolean {
  if (actor === 'SYSTEM') return GRAPH[from].some((t) => t.to === to)
  return GRAPH[from].some((t) => t.to === to && t.by.includes(actor))
}

export function nextStatuses(from: PactStatus, actor: Actor): PactStatus[] {
  return GRAPH[from].filter((t) => actor === 'SYSTEM' || t.by.includes(actor)).map((t) => t.to)
}

export const TERMINAL_STATUSES: PactStatus[] = ['COMPLETED', 'DECLINED', 'CANCELLED']
export function isTerminal(status: PactStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/** Statuses where money is expected to move — drives the "upcoming payments" list. */
export const PAYABLE_STATUSES: PactStatus[] = ['ACTIVE', 'IN_PROGRESS', 'DELIVERED']
export function isPayable(status: PactStatus): boolean {
  return PAYABLE_STATUSES.includes(status)
}

/** Display metadata. Kept next to the graph so a new status can't be added without one. */
export const STATUS_META: Record<
  PactStatus,
  { label: string; tone: 'neutral' | 'gold' | 'azure' | 'jade' | 'amber' | 'rose' | 'violet'; blurb: string }
> = {
  DRAFT: { label: 'Draft', tone: 'neutral', blurb: 'Not sent yet. Only you can see this.' },
  PENDING: { label: 'Awaiting signature', tone: 'amber', blurb: 'Waiting for the other side to accept and sign.' },
  NEGOTIATING: { label: 'In negotiation', tone: 'violet', blurb: 'Changes have been proposed.' },
  ACTIVE: { label: 'Sealed', tone: 'gold', blurb: 'Both sides signed. The terms are locked.' },
  IN_PROGRESS: { label: 'In progress', tone: 'azure', blurb: 'Work has started.' },
  DELIVERED: { label: 'Delivered', tone: 'azure', blurb: 'Waiting on review.' },
  COMPLETED: { label: 'Completed', tone: 'jade', blurb: 'Everything agreed has been done.' },
  DISPUTED: { label: 'Issue raised', tone: 'rose', blurb: 'One side has flagged a problem.' },
  DECLINED: { label: 'Declined', tone: 'rose', blurb: 'The other side turned this down.' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', blurb: 'Called off before completion.' },
}

/**
 * Dispute reasons, with the label the raiser picks and the line the *other* side reads.
 *
 * The second half matters more than the first. Being told "an issue was raised" helps
 * nobody; being told which of the four things went wrong is the difference between a
 * conversation and a standoff.
 */
export const DISPUTE_REASON_META: Record<DisputeReason, { label: string; hint: string; counterparty: string }> = {
  NOT_DELIVERED: {
    label: 'The work hasn’t been delivered',
    hint: 'Nothing has arrived, or what arrived is incomplete.',
    counterparty: 'They say the work hasn’t been delivered.',
  },
  NOT_AS_AGREED: {
    label: 'It isn’t what we agreed',
    hint: 'Something was delivered, but it doesn’t match the terms.',
    counterparty: 'They say what was delivered doesn’t match the agreed terms.',
  },
  LATE: {
    label: 'The deadline has passed',
    hint: 'The agreed date has gone by without this being finished.',
    counterparty: 'They say the agreed deadline has passed.',
  },
  PAYMENT_MISSING: {
    label: 'Payment hasn’t arrived',
    hint: 'Work was delivered, but the payment hasn’t come through.',
    counterparty: 'They say a payment they were owed hasn’t arrived.',
  },
  OTHER: {
    label: 'Something else',
    hint: 'Explain it in your own words below.',
    counterparty: 'They’ve flagged a problem outside the usual four.',
  },
}

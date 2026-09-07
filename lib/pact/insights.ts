import { daysUntil } from '../format.ts'
import { normalizeAddress } from '../nimiq/address.ts'
import { sumMinor } from './money.ts'
import { isTerminal } from './state.ts'
import type { Currency, Pact } from './types.ts'

/**
 * The numbers on the Command Center.
 *
 * Kept as pure functions rather than computed inline in the component for one specific
 * reason: "needs attention" is a judgement call about whose turn it is, and getting it
 * wrong means the home screen either nags people about things they cannot act on, or
 * stays quiet when someone is genuinely waiting on them. It deserves to be testable.
 */

export interface Insights {
  activeCount: number
  /** Totals are per currency — adding NIM to USDT would be a lie with a number on it. */
  totalValue: Array<{ currency: Currency; minor: string }>
  dueThisWeek: Pact[]
  needsAttention: Array<{ pact: Pact; reason: string }>
  overdue: Pact[]
}

function roleOf(pact: Pact, address: string): 'CLIENT' | 'PROVIDER' | null {
  const wanted = normalizeAddress(address)
  return pact.participants.find((p) => p.address && normalizeAddress(p.address) === wanted)?.role ?? null
}

function hasSigned(pact: Pact, address: string): boolean {
  const wanted = normalizeAddress(address)
  const self = pact.participants.find((p) => p.address && normalizeAddress(p.address) === wanted)
  return self?.sealSignature != null
}

/**
 * Is this waiting on *me*, right now?
 *
 * The test is deliberately strict: something only counts if the viewer can take the next
 * step themselves. A provider waiting to be paid is not "attention" for the provider — it
 * is attention for the client. Blurring that turns the badge into noise people learn to
 * ignore, which is worse than not having it.
 */
function attentionReason(pact: Pact, address: string, now: Date): string | null {
  const role = roleOf(pact, address)
  if (!role || isTerminal(pact.status)) return null

  switch (pact.status) {
    case 'PENDING':
      // Whoever has not signed yet holds the ball.
      return hasSigned(pact, address) ? null : 'Waiting for your signature'
    case 'NEGOTIATING':
      return 'Changes are waiting on a reply'
    case 'DELIVERED':
      return role === 'CLIENT' ? 'A delivery is ready for your review' : null
    case 'DISPUTED':
      return 'An issue was raised'
    case 'ACTIVE':
      return role === 'PROVIDER' ? 'Ready for you to start' : null
    default:
      break
  }

  if (pact.deadline && daysUntil(pact.deadline, now) < 0 && role === 'PROVIDER') {
    return 'Past its deadline'
  }
  return null
}

export function deriveInsights(pacts: Pact[], address: string, now: Date = new Date()): Insights {
  const live = pacts.filter((p) => !isTerminal(p.status))

  const byCurrency = new Map<Currency, string[]>()
  for (const pact of live) {
    byCurrency.set(pact.currency, [...(byCurrency.get(pact.currency) ?? []), pact.totalAmountMinor])
  }

  const needsAttention = pacts
    .map((pact) => ({ pact, reason: attentionReason(pact, address, now) }))
    .filter((entry): entry is { pact: Pact; reason: string } => entry.reason !== null)

  return {
    activeCount: live.length,
    totalValue: [...byCurrency.entries()]
      .map(([currency, amounts]) => ({ currency, minor: sumMinor(amounts) }))
      // Largest first, so the headline number is the one that matters most.
      .sort((a, b) => (BigInt(b.minor) > BigInt(a.minor) ? 1 : -1)),
    dueThisWeek: live.filter((p) => {
      if (!p.deadline) return false
      const days = daysUntil(p.deadline, now)
      return days >= 0 && days <= 7
    }),
    overdue: live.filter((p) => p.deadline != null && daysUntil(p.deadline, now) < 0),
    needsAttention,
  }
}

/** Sort for the main list: things needing action first, then soonest deadline. */
export function sortForDashboard(pacts: Pact[], address: string, now: Date = new Date()): Pact[] {
  return [...pacts].sort((a, b) => {
    const aAttention = attentionReason(a, address, now) ? 0 : 1
    const bAttention = attentionReason(b, address, now) ? 0 : 1
    if (aAttention !== bAttention) return aAttention - bAttention

    const aTerminal = isTerminal(a.status) ? 1 : 0
    const bTerminal = isTerminal(b.status) ? 1 : 0
    if (aTerminal !== bTerminal) return aTerminal - bTerminal

    if (a.deadline && b.deadline) return a.deadline < b.deadline ? -1 : 1
    if (a.deadline) return -1
    if (b.deadline) return 1
    return a.updatedAt < b.updatedAt ? 1 : -1
  })
}

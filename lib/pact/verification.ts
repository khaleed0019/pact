import { shortenAddress } from '../nimiq/address.ts'
import type { PactDetail, VerificationRecord } from './types.ts'

/**
 * The privacy boundary, as a single pure function.
 *
 * Both repositories hydrate a full `PactDetail` and then hand it here, so the decision
 * about what a stranger may see is made in exactly one place. That matters more than the
 * small duplication it avoids: a redaction rule that exists twice is a redaction rule
 * that will eventually disagree with itself, and the failure mode is publishing someone's
 * agreement.
 *
 * The construction below is deliberately explicit — every field is written out by hand
 * rather than spread from the source. Adding a column to `pacts` must never be able to
 * publish it by accident; it can only appear here if someone typed it here.
 */
export function toVerificationRecord(pact: PactDetail): VerificationRecord | null {
  // An allowlist, not `!== 'PRIVATE'`. The two are identical until the day this field is
  // null, undefined, or something a migration hasn't taught the app about yet — and on
  // that day the denylist publishes a private agreement while this one withholds a public
  // one. Only one of those failures is recoverable.
  if (pact.visibility !== 'SHAREABLE' && pact.visibility !== 'PUBLIC') return null

  return {
    shortId: pact.shortId,
    title: pact.title,
    status: pact.status,
    visibility: pact.visibility,
    currency: pact.currency,
    totalAmountMinor: pact.totalAmountMinor,
    deadline: pact.deadline,
    // The thing that makes this checkable rather than merely asserted.
    termsDigest: pact.termsDigest,
    parties: pact.participants.map((participant) => ({
      role: participant.role,
      displayName: participant.displayName,
      // Truncated, so a party can confirm their own without publishing a list of full
      // addresses for anyone to scrape and cross-reference on chain.
      addressPreview: participant.address ? shortenAddress(participant.address) : null,
      // Not secret, and publishing them is the point: a reader who doesn't trust PACT's
      // database can check these against the digest themselves.
      sealSignature: participant.sealSignature,
      sealPublicKey: participant.sealPublicKey,
      sealedAt: participant.sealedAt,
    })),
    milestones: pact.milestones.map((milestone) => ({
      position: milestone.position,
      title: milestone.title,
      amountMinor: milestone.amountMinor,
      status: milestone.status,
      dueDate: milestone.dueDate,
    })),
    // A count, not the payments. Transaction references stay with the parties — a
    // verifier needs to know that two payments settled, not which wallets to go look at.
    paymentsConfirmed: pact.payments.filter((payment) => payment.status === 'CONFIRMED' && payment.txReference).length,
    createdAt: pact.createdAt,
    updatedAt: pact.updatedAt,
  }
}

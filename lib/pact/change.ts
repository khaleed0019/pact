import type { PactDetail } from './types.ts'

/**
 * Did the terms move after both people signed them?
 *
 * The mechanism this reads was already there and already correct: editing terms
 * recomputes the digest and clears both signatures (`reseal()`), and the fingerprint at
 * the moment of sealing is recorded on the `PACT_SEALED` activity. What was missing is
 * that nothing ever *said* so — a user watched both signatures quietly become "Not
 * signed" with no explanation of why, which is the one thing this product exists to make
 * impossible to miss.
 *
 * So this derives the answer from recorded history rather than inventing a new mechanism.
 * Nothing here is stored, nothing is faked, and if the two digests match it returns null
 * rather than manufacturing a warning.
 *
 * Only fires on a pact that reached PACT_SEALED. A digest that moved while one side had
 * signed and the other had not is a normal part of negotiating, not a broken agreement,
 * and flagging it would cry wolf on the ordinary path.
 */
export interface TermsChange {
  /** The fingerprint both parties actually signed. */
  signedDigest: string
  /** What the terms fingerprint is now. */
  currentDigest: string
  signedAt: string
  /** When the digest first differed from the signed one, if the timeline recorded it. */
  changedAt: string | null
}

export function detectTermsChange(pact: PactDetail): TermsChange | null {
  // Most recent sealing wins: a pact can be re-signed after a renegotiation, and it is
  // the latest agreement both people put their name to that matters.
  // Walked backwards by hand rather than with findLastIndex, which needs an ES2023 lib
  // target this project doesn't set — not worth moving the target for one call.
  let sealedIndex = -1
  for (let i = pact.activities.length - 1; i >= 0; i--) {
    const activity = pact.activities[i]
    if (activity.kind === 'PACT_SEALED' && typeof activity.meta.fingerprint === 'string') {
      sealedIndex = i
      break
    }
  }
  if (sealedIndex === -1) return null

  const sealed = pact.activities[sealedIndex]
  const signedDigest = String(sealed.meta.fingerprint)
  if (signedDigest === pact.termsDigest) return null

  // Searched by position, not by timestamp. Sealing and the edit that follows can land in
  // the same millisecond, and comparing `createdAt > sealed.createdAt` then silently finds
  // nothing — the activity list is already ordered, so its order is the reliable signal.
  const changed = pact.activities
    .slice(sealedIndex + 1)
    .find(
      (activity) => typeof activity.meta.fingerprint === 'string' && activity.meta.fingerprint !== signedDigest,
    )

  return {
    signedDigest,
    currentDigest: pact.termsDigest,
    signedAt: sealed.createdAt,
    changedAt: changed?.createdAt ?? null,
  }
}

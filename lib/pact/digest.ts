import { blake2b } from '@noble/hashes/blake2b'
import type { Currency, EvmChainKey } from './types.ts'

/**
 * The terms fingerprint.
 *
 * Both parties sign this digest, so it has to be *canonical*: the same agreement must
 * always produce the same bytes, regardless of key order, whitespace the user typed, or
 * which client serialised it. If two runs could disagree, a signature would stop being
 * evidence of anything.
 *
 * The rules, deliberately boring:
 *  - fields appear in a fixed order, never `Object.keys()` order
 *  - each field is `key\x1Fvalue` and records are joined with `\x1E`
 *    (unit/record separators, which cannot appear in user text)
 *  - strings are NFC-normalised and have runs of whitespace collapsed
 *  - amounts are minor-unit strings, so 10 and 10.00 are the same value
 *  - lists are length-prefixed, so ["a","b"] and ["a b"] cannot collide
 */

export interface CanonicalTerms {
  title: string
  deliverable: string
  currency: Currency
  chain: EvmChainKey | null
  totalAmountMinor: string
  deadline: string | null
  paymentCondition: string
  specialTerms: string[]
  participants: Array<{ role: string; displayName: string; address: string | null }>
  milestones: Array<{ position: number; title: string; amountMinor: string; dueDate: string | null }>
}

const UNIT = '\x1F'
const RECORD = '\x1E'

function normalizeText(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim()
}

function field(key: string, value: string | number | null): string {
  return `${key}${UNIT}${value === null ? '' : typeof value === 'string' ? normalizeText(value) : String(value)}`
}

/** The exact byte string that gets hashed. Exported so tests can assert on it directly. */
export function canonicalize(terms: CanonicalTerms): string {
  const records: string[] = [
    field('v', 1), // format version — bump this and every old digest stays valid for its own version
    field('title', terms.title),
    field('deliverable', terms.deliverable),
    field('currency', terms.currency),
    field('chain', terms.chain),
    field('amount', terms.totalAmountMinor),
    field('deadline', terms.deadline),
    field('condition', terms.paymentCondition),
    field('terms.n', terms.specialTerms.length),
    ...terms.specialTerms.map((term, i) => field(`terms.${i}`, term)),
    field('parties.n', terms.participants.length),
    // Sorted by role so the client/provider ordering in memory cannot change the digest.
    ...[...terms.participants]
      .sort((a, b) => a.role.localeCompare(b.role))
      .flatMap((p, i) => [
        field(`party.${i}.role`, p.role),
        field(`party.${i}.name`, p.displayName),
        field(`party.${i}.address`, p.address ? p.address.replace(/\s/g, '').toUpperCase() : null),
      ]),
    field('milestones.n', terms.milestones.length),
    ...[...terms.milestones]
      .sort((a, b) => a.position - b.position)
      .flatMap((m, i) => [
        field(`ms.${i}.title`, m.title),
        field(`ms.${i}.amount`, m.amountMinor),
        field(`ms.${i}.due`, m.dueDate),
      ]),
  ]
  return records.join(RECORD)
}

/**
 * 32 hex characters — a 128-bit digest. Short enough that a person can compare it
 * across two phones by eye, long enough that finding a collision is not a threat model.
 * Rendered in groups of four everywhere it is shown.
 */
export function termsDigest(terms: CanonicalTerms): string {
  const hash = blake2b(new TextEncoder().encode(canonicalize(terms)), { dkLen: 16 })
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** `a1b2c3d4…` -> `A1B2 C3D4 …`, the form shown to users for eyeball comparison. */
export function formatDigest(digest: string): string {
  return digest.toUpperCase().replace(/.{4}/g, '$& ').trim()
}

/**
 * A short, human-typable reference derived from the digest. Goes in invite links and,
 * for NIM, into the transaction's data field so the payment's purpose is on-chain.
 * Uses the same ambiguity-free alphabet as Nimiq addresses.
 */
export function shortIdFromDigest(digest: string): string {
  const alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVXY'
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += alphabet[parseInt(digest.slice(i * 2, i * 2 + 2), 16) % 32]
  }
  return out
}

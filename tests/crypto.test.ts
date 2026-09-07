import test from 'node:test'
import assert from 'node:assert/strict'
import { ed25519 } from '@noble/curves/ed25519'
import { sha256 } from '@noble/hashes/sha2'
import { buildLoginMessage, buildSealMessage, verifySignature } from '../lib/nimiq/verify.ts'
import { bytesToHex, publicKeyToAddress } from '../lib/nimiq/address.ts'
import { canonicalize, formatDigest, shortIdFromDigest, termsDigest, type CanonicalTerms } from '../lib/pact/digest.ts'

const encoder = new TextEncoder()
const PRIV = new Uint8Array(32).fill(42)
const PUB = ed25519.getPublicKey(PRIV)

function signRaw(message: string) {
  return bytesToHex(ed25519.sign(encoder.encode(message), PRIV))
}

function signNimiqStyle(message: string) {
  const raw = encoder.encode(message)
  const prefix = encoder.encode('\x16Nimiq Signed Message:\n')
  const len = encoder.encode(String(raw.length))
  const buf = new Uint8Array(prefix.length + len.length + raw.length)
  buf.set(prefix, 0)
  buf.set(len, prefix.length)
  buf.set(raw, prefix.length + len.length)
  return bytesToHex(ed25519.sign(sha256(buf), PRIV))
}

test('a raw-encoded signature verifies and derives the signer address', () => {
  const message = buildLoginMessage('nonce-123', 'https://pact.example')
  const result = verifySignature({ message, publicKey: bytesToHex(PUB), signature: signRaw(message) })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.encoding, 'raw')
  assert.equal(result.address, publicKeyToAddress(PUB), 'address must be derived, not asserted')
})

test('a Nimiq signed-message encoding also verifies', () => {
  const message = buildLoginMessage('nonce-456', 'https://pact.example')
  const result = verifySignature({ message, publicKey: bytesToHex(PUB), signature: signNimiqStyle(message) })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.encoding, 'nimiq-signed-message')
})

test('a signature over a different nonce is rejected', () => {
  const signed = buildLoginMessage('nonce-A', 'https://pact.example')
  const claimed = buildLoginMessage('nonce-B', 'https://pact.example')
  const result = verifySignature({ message: claimed, publicKey: bytesToHex(PUB), signature: signRaw(signed) })
  assert.equal(result.ok, false)
})

test('a signature is bound to its origin', () => {
  const signed = buildLoginMessage('nonce-A', 'https://evil.example')
  const claimed = buildLoginMessage('nonce-A', 'https://pact.example')
  const result = verifySignature({ message: claimed, publicKey: bytesToHex(PUB), signature: signRaw(signed) })
  assert.equal(result.ok, false, 'a signature harvested by another site must not work here')
})

test('a signature cannot be attributed to a different public key', () => {
  const message = buildLoginMessage('nonce-1', 'https://pact.example')
  const otherPub = ed25519.getPublicKey(new Uint8Array(32).fill(9))
  const result = verifySignature({ message, publicKey: bytesToHex(otherPub), signature: signRaw(message) })
  assert.equal(result.ok, false)
})

test('malformed input is rejected without throwing', () => {
  const message = 'hello'
  assert.equal(verifySignature({ message, publicKey: 'zz', signature: 'zz' }).ok, false)
  assert.equal(verifySignature({ message, publicKey: '00', signature: signRaw(message) }).ok, false)
  assert.equal(verifySignature({ message, publicKey: bytesToHex(PUB), signature: '00'.repeat(64) }).ok, false)
})

// --- terms digest -----------------------------------------------------------------

const BASE: CanonicalTerms = {
  title: 'Website design',
  deliverable: 'A five page marketing site',
  currency: 'USDT',
  chain: 'polygon',
  totalAmountMinor: '200000000',
  deadline: '2026-09-20',
  paymentCondition: 'After final approval',
  specialTerms: ['Two rounds of revisions included'],
  participants: [
    { role: 'CLIENT', displayName: 'Khaleed', address: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000' },
    { role: 'PROVIDER', displayName: 'John', address: null },
  ],
  milestones: [{ position: 1, title: 'Final delivery', amountMinor: '200000000', dueDate: '2026-09-20' }],
}

test('the digest is stable across key order and cosmetic whitespace', () => {
  const reordered: CanonicalTerms = {
    ...BASE,
    title: '  Website   design ',
    participants: [...BASE.participants].reverse(),
  }
  assert.equal(termsDigest(reordered), termsDigest(BASE))
})

test('changing any material term changes the digest', () => {
  const digest = termsDigest(BASE)
  const mutations: Array<Partial<CanonicalTerms>> = [
    { totalAmountMinor: '200000001' },
    { deadline: '2026-09-21' },
    { paymentCondition: 'Half upfront' },
    { currency: 'NIM' },
    { chain: 'arbitrum' },
    { deliverable: 'A four page marketing site' },
    { specialTerms: ['Two rounds of revisions included', 'Source files included'] },
    { milestones: [{ position: 1, title: 'Final delivery', amountMinor: '100000000', dueDate: '2026-09-20' }] },
  ]
  for (const mutation of mutations) {
    assert.notEqual(termsDigest({ ...BASE, ...mutation }), digest, `${JSON.stringify(mutation)} must move the digest`)
  }
})

test('list boundaries cannot be forged by embedding a separator', () => {
  const a = termsDigest({ ...BASE, specialTerms: ['alpha', 'beta'] })
  const b = termsDigest({ ...BASE, specialTerms: ['alpha beta'] })
  assert.notEqual(a, b)
})

test('the digest and short id have the shapes the UI and the memo field expect', () => {
  const digest = termsDigest(BASE)
  assert.match(digest, /^[0-9a-f]{32}$/)
  assert.match(formatDigest(digest), /^([0-9A-F]{4} ){7}[0-9A-F]{4}$/)
  const shortId = shortIdFromDigest(digest)
  assert.match(shortId, /^[0-9A-HJ-NP-VXY]{8}$/, 'short id uses the unambiguous alphabet')
  assert.equal(shortIdFromDigest(digest), shortId, 'short id is deterministic')
})

test('canonical form uses separators that user text cannot contain', () => {
  const canonical = canonicalize(BASE)
  assert.ok(canonical.includes('\x1F'))
  assert.ok(canonical.includes('\x1E'))
  assert.ok(canonical.startsWith('v\x1F1'), 'version is pinned first so the format can evolve safely')
})

test('the seal message commits to the digest the signer is shown', () => {
  const digest = termsDigest(BASE)
  const message = buildSealMessage({ shortId: 'ABCD1234', title: BASE.title, termsDigest: digest, role: 'CLIENT' })
  assert.ok(message.includes(digest))
  assert.ok(message.includes('ABCD1234'))
})

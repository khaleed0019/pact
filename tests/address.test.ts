import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bytesToUserFriendlyAddress,
  formatAddress,
  isValidAddress,
  normalizeAddress,
  publicKeyToAddress,
  shortenAddress,
  userFriendlyAddressToBytes,
} from '../lib/nimiq/address.ts'

/**
 * The burn address is the one Nimiq address whose derivation we can check against a
 * published constant: 20 zero bytes must render as NQ07 0000 ... If the base32 alphabet
 * or the mod-97 checksum were wrong, this would not match.
 */
const BURN = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

test('20 zero bytes render as the documented burn address', () => {
  assert.equal(bytesToUserFriendlyAddress(new Uint8Array(20)), BURN)
})

test('the burn address validates', () => {
  assert.equal(isValidAddress(BURN), true)
  assert.equal(isValidAddress(normalizeAddress(BURN)), true)
  assert.equal(isValidAddress(BURN.toLowerCase()), true)
})

test('a corrupted address fails the checksum', () => {
  assert.equal(isValidAddress('NQ07 0000 0000 0000 0000 0000 0000 0000 0001'), false)
  assert.equal(isValidAddress('NQ08 0000 0000 0000 0000 0000 0000 0000 0000'), false)
})

test('ambiguous characters are outside the alphabet', () => {
  // I, O, W and Z are excluded precisely so they cannot be confused when retyped.
  for (const bad of ['I', 'O', 'W', 'Z']) {
    assert.equal(isValidAddress(`NQ07 ${bad}000 0000 0000 0000 0000 0000 0000 0000`), false)
  }
})

test('addresses round-trip through bytes', () => {
  for (let seed = 0; seed < 32; seed++) {
    const bytes = Uint8Array.from({ length: 20 }, (_, i) => (i * 31 + seed * 7) % 256)
    const address = bytesToUserFriendlyAddress(bytes)
    assert.equal(isValidAddress(address), true, `${address} should validate`)
    assert.deepEqual(userFriendlyAddressToBytes(address), bytes)
  }
})

test('public keys derive to valid addresses deterministically', () => {
  const key = new Uint8Array(32).fill(7)
  const first = publicKeyToAddress(key)
  assert.equal(isValidAddress(first), true)
  assert.equal(publicKeyToAddress(key), first, 'derivation must be deterministic')

  const other = new Uint8Array(32).fill(8)
  assert.notEqual(publicKeyToAddress(other), first, 'different keys, different addresses')
})

test('malformed public keys are rejected rather than silently truncated', () => {
  assert.throws(() => publicKeyToAddress(new Uint8Array(31)))
  assert.throws(() => publicKeyToAddress(new Uint8Array(33)))
})

test('display helpers do not corrupt the address', () => {
  assert.equal(formatAddress(normalizeAddress(BURN)), BURN)
  assert.equal(shortenAddress(BURN), 'NQ07…0000')
})

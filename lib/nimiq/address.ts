import { blake2b } from '@noble/hashes/blake2b'

/**
 * Nimiq address derivation and formatting.
 *
 * This is the load-bearing piece of PACT's auth model: the server never accepts an
 * address a client claims to own. It takes the public key returned by `nimiq.sign()`,
 * derives the address itself, and only then decides who is talking to it.
 *
 * Derivation, per the Nimiq protocol:
 *   address bytes = Blake2b-256(publicKey)[0..20]
 *
 * Friendly form is IBAN-shaped: `NQ` + 2 check digits + 32 base32 characters, printed
 * in groups of four. The check digits are the same mod-97 scheme IBAN uses.
 */

/** Nimiq's base32 alphabet — standard RFC 4648 minus the ambiguous I, O, W and Z. */
const NIMIQ_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY'

export class AddressError extends Error {}

function toBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += NIMIQ_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += NIMIQ_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function fromBase32(input: string): Uint8Array {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of input) {
    const index = NIMIQ_ALPHABET.indexOf(char)
    if (index === -1) throw new AddressError(`Invalid character "${char}" in address.`)
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

/**
 * IBAN mod-97-10. Letters become their 0-indexed alphabet position + 10, then the whole
 * thing is reduced 97 at a time so we never build a number bigger than a float can hold.
 */
function ibanCheck(input: string): number {
  const expanded = input
    .split('')
    .map((c) => {
      const code = c.charCodeAt(0)
      // 'A'..'Z' -> 10..35, digits stay as-is.
      return code >= 48 && code <= 57 ? c : (code - 55).toString()
    })
    .join('')

  let remainder = 0
  for (let i = 0; i < expanded.length; i += 6) {
    remainder = Number(String(remainder) + expanded.slice(i, i + 6)) % 97
  }
  return remainder
}

/** 20 raw address bytes -> `NQ07 0000 ...` with spaces every four characters. */
export function bytesToUserFriendlyAddress(bytes: Uint8Array): string {
  if (bytes.length !== 20) throw new AddressError('A Nimiq address is exactly 20 bytes.')
  const base32 = toBase32(bytes)
  const check = String(98 - ibanCheck(`${base32}NQ00`)).padStart(2, '0')
  return `NQ${check}${base32}`.replace(/.{4}/g, '$& ').trim()
}

/** Strips spaces and upper-cases, so `nq07 abcd...` and `NQ07ABCD...` compare equal. */
export function normalizeAddress(address: string): string {
  return address.replace(/[\s]/g, '').toUpperCase()
}

export function isValidAddress(address: string): boolean {
  const normalized = normalizeAddress(address)
  if (!/^NQ\d{2}[0-9A-HJ-NP-VXY]{32}$/.test(normalized)) return false
  // Move the country + check digits to the end, exactly as IBAN validation does.
  return ibanCheck(`${normalized.slice(4)}${normalized.slice(0, 4)}`) === 1
}

export function userFriendlyAddressToBytes(address: string): Uint8Array {
  const normalized = normalizeAddress(address)
  if (!isValidAddress(normalized)) throw new AddressError('That is not a valid Nimiq address.')
  return fromBase32(normalized.slice(4))
}

/** The one that matters: public key in, address out. Never trust a client-sent address. */
export function publicKeyToAddress(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) throw new AddressError('An Ed25519 public key is exactly 32 bytes.')
  return bytesToUserFriendlyAddress(blake2b(publicKey, { dkLen: 32 }).slice(0, 20))
}

/** `NQ07 1234 ...` -> `NQ07…5678`, for tight mobile rows where the full 36 chars won't fit. */
export function shortenAddress(address: string): string {
  const normalized = normalizeAddress(address)
  if (normalized.length < 12) return address
  return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`
}

/** Groups of four, which is how Nimiq Pay itself renders addresses. */
export function formatAddress(address: string): string {
  return normalizeAddress(address).replace(/.{4}/g, '$& ').trim()
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new AddressError('Expected a hex string.')
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

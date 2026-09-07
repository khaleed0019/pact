import { ed25519 } from '@noble/curves/ed25519'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, hexToBytes, publicKeyToAddress } from './address.ts'

/**
 * Server-side verification of signatures produced by `window.nimiq.sign()`.
 *
 * ## Why more than one candidate encoding
 *
 * The Mini App SDK types tell us `sign()` returns `{ publicKey, signature }` but do not
 * pin down what exactly was hashed. Nimiq's own message-signing convention wraps the
 * payload in a fixed prefix before hashing (so a signed message can never be replayed
 * as a signed transaction), while a plain Ed25519 signature would be over the raw bytes.
 *
 * Rather than guess and ship an auth system that silently rejects every real user, we
 * verify against every well-defined encoding of *the exact message we issued*. This
 * costs nothing in security: each candidate is a deterministic transform of a nonce
 * this server generated seconds ago, and a valid Ed25519 signature over any of them
 * still proves possession of the private key. An attacker who cannot sign cannot pass.
 *
 * `verifySignature` reports which encoding matched, so production logs will tell us
 * which one Nimiq Pay actually uses and this list can be narrowed later.
 */

/** Nimiq's signed-message prefix. 0x16 is the length of the string that follows it. */
const NIMIQ_MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n'

const encoder = new TextEncoder()

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export type SignatureEncoding = 'raw' | 'nimiq-signed-message' | 'sha256'

/** Every byte string that could legitimately have been signed for `message`. */
function candidates(message: string): Array<{ encoding: SignatureEncoding; bytes: Uint8Array }> {
  const raw = encoder.encode(message)
  const prefixed = concat(encoder.encode(NIMIQ_MESSAGE_PREFIX), encoder.encode(String(raw.length)), raw)
  return [
    { encoding: 'raw', bytes: raw },
    { encoding: 'nimiq-signed-message', bytes: sha256(prefixed) },
    { encoding: 'sha256', bytes: sha256(raw) },
  ]
}

export interface VerifiedSignature {
  ok: true
  /** Derived from the public key by us. Never taken from the request body. */
  address: string
  publicKey: string
  encoding: SignatureEncoding
}

export interface FailedSignature {
  ok: false
  reason: string
}

export function verifySignature(input: {
  message: string
  publicKey: string
  signature: string
}): VerifiedSignature | FailedSignature {
  let publicKeyBytes: Uint8Array
  let signatureBytes: Uint8Array

  try {
    publicKeyBytes = hexToBytes(input.publicKey)
    signatureBytes = hexToBytes(input.signature)
  } catch {
    return { ok: false, reason: 'Signature and public key must be hex.' }
  }

  if (publicKeyBytes.length !== 32) return { ok: false, reason: 'Public key must be 32 bytes.' }
  if (signatureBytes.length !== 64) return { ok: false, reason: 'Signature must be 64 bytes.' }

  for (const candidate of candidates(input.message)) {
    let valid = false
    try {
      valid = ed25519.verify(signatureBytes, candidate.bytes, publicKeyBytes)
    } catch {
      // A malformed point or non-canonical scalar throws rather than returning false.
      valid = false
    }
    if (valid) {
      return {
        ok: true,
        address: publicKeyToAddress(publicKeyBytes),
        publicKey: bytesToHex(publicKeyBytes),
        encoding: candidate.encoding,
      }
    }
  }

  return { ok: false, reason: 'Signature does not match the message.' }
}

/**
 * The exact text a user signs to log in. Both the client and the verifier build this
 * from the same function, so the two can never disagree about what was signed.
 *
 * It names the app, states the intent in plain language (the user sees this string in
 * the wallet's native dialog), and binds the signature to one origin and one nonce so
 * it cannot be replayed against another site or a second time here.
 */
export function buildLoginMessage(nonce: string, origin: string): string {
  return [
    'PACT — sign in',
    '',
    'Signing this proves you control this address.',
    'It does not approve any payment.',
    '',
    `Origin: ${origin}`,
    `Nonce: ${nonce}`,
  ].join('\n')
}

/**
 * The text signed to seal a pact. Unlike login, this one is a commitment: the digest it
 * contains covers every material term, so a signature over this message is evidence the
 * signer saw those exact terms.
 */
export function buildSealMessage(input: {
  shortId: string
  title: string
  termsDigest: string
  role: string
}): string {
  return [
    'PACT — seal this agreement',
    '',
    `Agreement: ${input.title}`,
    `Reference: ${input.shortId}`,
    `Your role: ${input.role}`,
    '',
    'By signing you confirm you agree to the exact terms',
    'identified by the fingerprint below.',
    '',
    `Terms fingerprint: ${input.termsDigest}`,
  ].join('\n')
}

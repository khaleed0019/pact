import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { normalizeAddress } from '../nimiq/address.ts'

/**
 * Sessions.
 *
 * A session is a signed statement by this server that a given address proved control of
 * its key. It is deliberately not a JWT library and not a database table: the only claim
 * it carries is the address, and the only thing it has to resist is being forged or
 * replayed after expiry.
 *
 * Cookie: HttpOnly (script cannot read it), SameSite=Lax (not sent on cross-site POSTs),
 * Secure in production, and signed with HMAC-SHA256 over the exact payload.
 */

const COOKIE_NAME = 'pact_session'
const NONCE_COOKIE = 'pact_nonce'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const NONCE_TTL_SECONDS = 60 * 5

/**
 * In development a generated secret is fine — it only means sessions do not survive a
 * server restart. In production a missing secret is a hard failure rather than a silent
 * fallback, because a per-instance random secret would let any instance mint cookies the
 * others reject, and would quietly rotate on every deploy.
 */
function secret(): string {
  const configured = process.env.SESSION_SECRET
  if (configured && configured.length >= 32) return configured

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set to at least 32 characters in production.')
  }
  globalThis.__pactDevSecret ??= randomBytes(32).toString('hex')
  return globalThis.__pactDevSecret
}

declare global {
  // eslint-disable-next-line no-var
  var __pactDevSecret: string | undefined
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

/** Constant-time compare, so a signature cannot be discovered one byte at a time. */
function signatureMatches(payload: string, provided: string): boolean {
  const expected = sign(payload)
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface Session {
  address: string
  /** How the signature was encoded, recorded so we can narrow the accepted set later. */
  encoding: string
  issuedAt: number
  expiresAt: number
}

function encode(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function decode(token: string): Session | null {
  const separator = token.lastIndexOf('.')
  if (separator === -1) return null

  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  if (!signatureMatches(payload, signature)) return null

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session
    if (typeof session.address !== 'string' || typeof session.expiresAt !== 'number') return null
    if (session.expiresAt < Date.now()) return null
    return session
  } catch {
    return null
  }
}

export async function createSession(input: { address: string; encoding: string }): Promise<void> {
  const issuedAt = Date.now()
  const session: Session = {
    address: normalizeAddress(input.address),
    encoding: input.encoding,
    issuedAt,
    expiresAt: issuedAt + SESSION_TTL_SECONDS * 1000,
  }

  const store = await cookies()
  store.set(COOKIE_NAME, encode(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function readSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  return token ? decode(token) : null
}

export async function destroySession(): Promise<void> {
  ;(await cookies()).delete(COOKIE_NAME)
}

// --- login nonces -------------------------------------------------------------------

/**
 * The login nonce lives in its own signed, short-lived cookie rather than in server
 * memory. That keeps the app horizontally scalable (any instance can verify a challenge
 * it did not issue) while still being single-use in practice: it is cleared the moment
 * it is spent, and it expires in five minutes regardless.
 */
export async function issueNonce(): Promise<string> {
  const nonce = randomBytes(24).toString('base64url')
  const expiresAt = Date.now() + NONCE_TTL_SECONDS * 1000
  const payload = Buffer.from(JSON.stringify({ nonce, expiresAt })).toString('base64url')

  const store = await cookies()
  store.set(NONCE_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: NONCE_TTL_SECONDS,
  })
  return nonce
}

/** Consume the nonce. Returns false if it is missing, forged, expired, or mismatched. */
export async function consumeNonce(claimed: string): Promise<boolean> {
  const store = await cookies()
  const token = store.get(NONCE_COOKIE)?.value
  if (!token) return false

  store.delete(NONCE_COOKIE) // single use, spent whether or not it turns out to be valid

  const separator = token.lastIndexOf('.')
  if (separator === -1) return false
  const payload = token.slice(0, separator)
  if (!signatureMatches(payload, token.slice(separator + 1))) return false

  try {
    const { nonce, expiresAt } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      nonce: string
      expiresAt: number
    }
    if (expiresAt < Date.now()) return false
    // Constant-time compare so the nonce cannot be probed either.
    const a = Buffer.from(nonce)
    const b = Buffer.from(claimed)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

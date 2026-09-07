'use client'

import { init, getHostLanguage, requestDeviceIdentifier } from '@nimiq/mini-app-sdk'
import type { NimiqProvider } from '@nimiq/mini-app-sdk'
import { PactError, toPactError } from '../errors.ts'

/**
 * The single place PACT touches the injected wallet providers.
 *
 * Nothing else in the app imports `@nimiq/mini-app-sdk` or reads `window.nimiq`,
 * `window.nimiqPay` or `window.ethereum` directly. Two reasons:
 *
 *  1. The Nimiq provider **resolves with `{ error: { type, message } }` instead of
 *     throwing**. Any call site that forgets to narrow will happily treat an error
 *     object as a success value — with `sendBasicTransaction` that means telling a user
 *     their money went out when it did not. `unwrap()` below makes that impossible.
 *  2. Outside Nimiq Pay these globals simply do not exist. Funnelling every access
 *     through here lets the whole app degrade into demo mode cleanly instead of
 *     crashing on a white screen.
 */

/** Shape the SDK returns on failure. It is a resolved value, not a rejection. */
function isErrorResponse(value: unknown): value is { error: { type: string; message: string } } {
  return typeof value === 'object' && value !== null && 'error' in value
}

/**
 * Narrow a provider result to its success type, or throw a typed PactError.
 * Every provider call in this file goes through it. No exceptions.
 */
function unwrap<T>(value: T | { error: { type: string; message: string } }): T {
  if (isErrorResponse(value)) throw toPactError(value)
  return value
}

export type WalletEnvironment = 'nimiq-pay' | 'browser'

/** Cheap synchronous probe — safe to call during render to pick the right UI. */
export function detectEnvironment(): WalletEnvironment {
  if (typeof window === 'undefined') return 'browser'
  return window.nimiq !== undefined || window.nimiqPay !== undefined ? 'nimiq-pay' : 'browser'
}

let cached: Promise<NimiqProvider> | null = null

/**
 * Resolve the Nimiq provider, with a bounded wait.
 *
 * `init()` waits for the host to inject the provider, so in a plain browser it would
 * hang until its own timeout. We keep the timeout short and translate the failure into
 * NOT_IN_NIMIQ_PAY, which is the actionable message rather than a generic timeout.
 */
export function getNimiq(timeout = 6000): Promise<NimiqProvider> {
  if (typeof window === 'undefined') {
    return Promise.reject(new PactError('NOT_IN_NIMIQ_PAY'))
  }
  if (!cached) {
    cached = init({ timeout }).catch((cause) => {
      cached = null // let a later attempt retry rather than caching the failure forever
      throw detectEnvironment() === 'browser' ? new PactError('NOT_IN_NIMIQ_PAY') : toPactError(cause)
    })
  }
  return cached
}

export interface WalletSession {
  address: string
  /** Every address the wallet exposed, in case we later let the user pick. */
  addresses: string[]
  environment: WalletEnvironment
}

export async function connectWallet(): Promise<WalletSession> {
  const nimiq = await getNimiq()
  const accounts = unwrap(await nimiq.listAccounts())
  if (!Array.isArray(accounts) || accounts.length === 0) throw new PactError('NO_ACCOUNTS')
  return { address: accounts[0], addresses: accounts, environment: 'nimiq-pay' }
}

export interface SignedMessage {
  publicKey: string
  signature: string
}

/** Ask the wallet to sign `message`. The user sees this exact text in a native dialog. */
export async function signMessage(message: string): Promise<SignedMessage> {
  const nimiq = await getNimiq()
  const result = unwrap(await nimiq.sign(message))
  if (!result || typeof result.signature !== 'string' || typeof result.publicKey !== 'string') {
    throw new PactError('UNKNOWN', 'Wallet returned an unrecognised signature payload.')
  }
  return { publicKey: result.publicKey, signature: result.signature }
}

/**
 * Whether the wallet has caught up with the network.
 *
 * PACT calls this before quoting chain state, but deliberately does *not* block payment
 * on it: `sendBasicTransaction` is the wallet's own business and it will surface its own
 * error if it cannot proceed. Blocking here would only add a failure mode of our own.
 */
export async function isConsensusEstablished(): Promise<boolean> {
  try {
    const nimiq = await getNimiq()
    return await nimiq.isConsensusEstablished()
  } catch {
    return false
  }
}

export async function getBlockNumber(): Promise<number | null> {
  try {
    const nimiq = await getNimiq()
    return await nimiq.getBlockNumber()
  } catch {
    return null
  }
}

/**
 * Send NIM with a memo written into the transaction's data field.
 *
 * Returns whatever reference the provider gives back (the serialized transaction). PACT
 * stores it verbatim and marks the payment SUBMITTED — never CONFIRMED, because a
 * submitted transaction is not yet a settled one.
 */
export async function sendNimWithMemo(input: {
  recipient: string
  /** Luna. 1 NIM = 100000 Luna. */
  value: number
  memo: string
}): Promise<string> {
  const nimiq = await getNimiq()
  const reference = unwrap(
    await nimiq.sendBasicTransactionWithData({
      recipient: input.recipient,
      value: input.value,
      data: input.memo,
    }),
  )
  if (typeof reference !== 'string' || reference.length === 0) {
    throw new PactError('UNKNOWN', 'Wallet did not return a transaction reference.')
  }
  return reference
}

/** Same as above without a memo, for the rare case where the data field is unwanted. */
export async function sendNim(input: { recipient: string; value: number }): Promise<string> {
  const nimiq = await getNimiq()
  const reference = unwrap(await nimiq.sendBasicTransaction({ recipient: input.recipient, value: input.value }))
  if (typeof reference !== 'string' || reference.length === 0) {
    throw new PactError('UNKNOWN', 'Wallet did not return a transaction reference.')
  }
  return reference
}

/** ISO 639-1 code chosen in Nimiq Pay, falling back to the browser then English. */
export function detectLocale(): string {
  try {
    const host = getHostLanguage()
    if (host) return host
  } catch {
    // getHostLanguage reads a global that may not exist outside Nimiq Pay.
  }
  if (typeof navigator !== 'undefined') return navigator.language.split('-')[0] || 'en'
  return 'en'
}

/**
 * A pseudonymous per-device handle.
 *
 * The framework docs are explicit that this identifies a device, not a user, and must
 * not be used for authentication — PACT uses signatures for that. It is used only to
 * rate-limit pact creation from a single device and to recover an unsent draft.
 */
export async function getDeviceIdentifier(reason: string): Promise<string | null> {
  try {
    return await requestDeviceIdentifier({ reason })
  } catch {
    return null // denial is expected and must never block the app
  }
}

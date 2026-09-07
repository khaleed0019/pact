/**
 * Every way PACT can fail, translated into something a person can act on.
 *
 * The rule this file exists to enforce: a user must never see a raw provider string,
 * an RPC code, or "Something went wrong". They get a title, a plain-language body, and
 * a clear answer to "can I try again?".
 */

export type ErrorCode =
  | 'NOT_IN_NIMIQ_PAY'
  | 'PROVIDER_TIMEOUT'
  | 'NO_ACCOUNTS'
  | 'USER_REJECTED'
  | 'INSUFFICIENT_FUNDS'
  | 'INSUFFICIENT_GAS'
  | 'WRONG_CHAIN'
  | 'CHAIN_NOT_ADDED'
  | 'CONSENSUS_PENDING'
  | 'OFFLINE'
  | 'DUPLICATE_ACTION'
  | 'INVITE_EXPIRED'
  | 'INVITE_INVALID'
  | 'STALE_STATE'
  | 'NOT_ALLOWED'
  | 'VALIDATION'
  | 'AI_UNAVAILABLE'
  | 'SERVER'
  | 'UNKNOWN'

export interface UserFacingError {
  code: ErrorCode
  title: string
  body: string
  /** Whether offering a "Try again" button makes sense. */
  retry: boolean
  /** A cancellation is a decision, not a failure — the UI styles it neutrally. */
  benign?: boolean
}

const CATALOG: Record<ErrorCode, Omit<UserFacingError, 'code'>> = {
  NOT_IN_NIMIQ_PAY: {
    title: 'Open this in Nimiq Pay',
    body: 'PACT signs agreements and sends payments with your wallet, so it needs to run inside the Nimiq Pay app. You can still explore the demo here.',
    retry: false,
  },
  PROVIDER_TIMEOUT: {
    title: "Your wallet didn't respond",
    body: 'Nimiq Pay took too long to connect. This usually clears up on a second try.',
    retry: true,
  },
  NO_ACCOUNTS: {
    title: 'No wallet address found',
    body: 'Nimiq Pay did not return an address. Make sure you have an account set up, then try again.',
    retry: true,
  },
  USER_REJECTED: {
    title: 'Cancelled',
    body: 'You dismissed the wallet prompt. Nothing was signed and no money moved.',
    retry: true,
    benign: true,
  },
  INSUFFICIENT_FUNDS: {
    title: 'Not enough balance',
    body: 'Your wallet does not hold enough to cover this payment. Top up and try again.',
    retry: true,
  },
  INSUFFICIENT_GAS: {
    title: 'Not enough for network fees',
    body: 'Sending USDT also costs a small network fee, paid in the chain’s own coin. Add some to your wallet and try again.',
    retry: true,
  },
  WRONG_CHAIN: {
    title: 'Wrong network',
    body: 'Your wallet is on a different network than this agreement uses. PACT will ask to switch it.',
    retry: true,
  },
  CHAIN_NOT_ADDED: {
    title: 'Network unavailable',
    body: 'This network is not configured in your wallet, so PACT cannot send on it. Pick another network for this agreement.',
    retry: false,
  },
  CONSENSUS_PENDING: {
    title: 'Still syncing',
    body: 'Your wallet is catching up with the Nimiq network. Give it a moment before sending.',
    retry: true,
  },
  OFFLINE: {
    title: 'No connection',
    body: 'PACT cannot reach the network. Your changes are kept locally until you are back online.',
    retry: true,
  },
  DUPLICATE_ACTION: {
    title: 'Already done',
    body: 'This action has already gone through. Refreshing will show the current state.',
    retry: false,
    benign: true,
  },
  INVITE_EXPIRED: {
    title: 'This invite has expired',
    body: 'Ask the person who sent it to share a fresh link.',
    retry: false,
  },
  INVITE_INVALID: {
    title: 'This invite is not valid',
    body: 'The link may have been mistyped, or the agreement was withdrawn.',
    retry: false,
  },
  STALE_STATE: {
    title: 'This has moved on',
    body: 'The other side changed something while you had this open. PACT reloaded the latest version so you can see what changed.',
    retry: false,
  },
  NOT_ALLOWED: {
    title: 'Not available for you',
    body: 'Only the other party can take this step right now.',
    retry: false,
  },
  VALIDATION: { title: 'Check the details', body: 'Something in the form needs fixing.', retry: false },
  AI_UNAVAILABLE: {
    title: 'Assistant unavailable',
    body: 'PACT could not reach the AI service, so it fell back to its built-in reader. You can still edit every field yourself.',
    retry: true,
    benign: true,
  },
  SERVER: { title: 'PACT had a problem', body: 'Something failed on our side. Nothing was lost — try again.', retry: true },
  UNKNOWN: { title: 'That did not work', body: 'PACT hit an unexpected problem. Try again in a moment.', retry: true },
}

export class PactError extends Error {
  readonly code: ErrorCode
  readonly detail?: string

  constructor(code: ErrorCode, detail?: string) {
    super(CATALOG[code].title)
    this.name = 'PactError'
    this.code = code
    this.detail = detail
  }

  toUserFacing(): UserFacingError {
    return { code: this.code, ...CATALOG[this.code] }
  }
}

export function describe(code: ErrorCode): UserFacingError {
  return { code, ...CATALOG[code] }
}

/** EIP-1193 / provider rejection codes. 4001 is the universal "user said no". */
const REJECTION_CODES = new Set([4001, -32603 /* often wraps a rejection */])

/**
 * Turn anything thrown or returned by a provider into a `PactError`.
 *
 * Nimiq's provider resolves with `{ error: { type, message } }` rather than throwing,
 * and EVM providers throw objects with a numeric `code`. Both paths land here so no
 * call site has to remember the difference.
 */
export function toPactError(cause: unknown): PactError {
  if (cause instanceof PactError) return cause

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new PactError('OFFLINE')
  }

  const record = (cause ?? {}) as Record<string, unknown>
  const nested = (record.error ?? {}) as Record<string, unknown>
  const code = typeof record.code === 'number' ? record.code : undefined
  const text = String(nested.message ?? record.message ?? record.reason ?? cause ?? '').toLowerCase()
  const type = String(nested.type ?? '').toLowerCase()
  const haystack = `${type} ${text}`

  if (code !== undefined && REJECTION_CODES.has(code) && /reject|denied|cancel/.test(haystack)) {
    return new PactError('USER_REJECTED', text)
  }
  if (code === 4001) return new PactError('USER_REJECTED', text)
  if (code === 4902) return new PactError('CHAIN_NOT_ADDED', text)

  if (/reject|denied|declined|cancel|dismiss|abort/.test(haystack)) return new PactError('USER_REJECTED', text)
  if (/insufficient funds|insufficient balance|not enough/.test(haystack)) {
    // "insufficient funds for gas" is a distinct, differently-fixable problem.
    return new PactError(/gas|intrinsic/.test(haystack) ? 'INSUFFICIENT_GAS' : 'INSUFFICIENT_FUNDS', text)
  }
  if (/gas required|out of gas|intrinsic gas/.test(haystack)) return new PactError('INSUFFICIENT_GAS', text)
  if (/consensus/.test(haystack)) return new PactError('CONSENSUS_PENDING', text)
  if (/chain|network mismatch|unrecognized chain/.test(haystack)) return new PactError('WRONG_CHAIN', text)
  if (/timeout|timed out/.test(haystack)) return new PactError('PROVIDER_TIMEOUT', text)
  if (/no provider|not running inside|window\.nimiq/.test(haystack)) return new PactError('NOT_IN_NIMIQ_PAY', text)
  if (/network|fetch failed|failed to fetch/.test(haystack)) return new PactError('OFFLINE', text)

  return new PactError('UNKNOWN', text || undefined)
}

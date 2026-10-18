import { normalizeAddress } from './address.ts'
import { EVM_CHAINS, type EvmChainKey } from '../pact/types.ts'

/**
 * Did this payment actually happen?
 *
 * The only question PACT may ask a *chain* rather than a *browser*. Everything before this
 * existed took the client's word: the wallet handed back a reference, the client said
 * CONFIRMED, and the server wrote it down. A payer could therefore mark their own payment
 * paid with any string at all, and nothing in the product would have noticed.
 *
 * ## Three outcomes, and why there are three
 *
 *   CONFIRMED  The chain shows exactly this payment: right recipient, right amount, right
 *              memo or token, executed successfully, buried under enough confirmations.
 *   PENDING    We cannot say yet. Not broadcast, not yet included, too few confirmations,
 *              or the node could not be reached. Never treated as success *or* failure.
 *   REJECTED   The chain shows something, and it is not this payment. Wrong amount, wrong
 *              recipient, wrong memo, reverted, wrong network.
 *
 * The line between PENDING and REJECTED is the important one. An unreachable public node
 * must never be able to fail a real payment, and it must never be able to confirm one — so
 * every infrastructure failure lands on PENDING, and only a positive mismatch is REJECTED.
 *
 * ## What the wallet returns is not trusted to be one thing
 *
 * The official Mini Apps docs say `sendBasicTransactionWithData` returns a transaction
 * *hash*. The SDK type definitions this repo ships (`@nimiq/mini-app-sdk@0.1.0`) say it
 * returns the *serialized transaction*, and other Mini Apps report both. So a 64-hex
 * reference is looked up by hash, and anything else falls back to finding the payment in
 * the recipient's recent history by amount and memo. Either way the thing that gets
 * confirmed is read off the chain, never off the string the client supplied.
 *
 * Pure of I/O apart from the injected `fetch`, so it is tested against recorded response
 * shapes without a network.
 */

export type VerifyOutcome =
  | { state: 'CONFIRMED'; txHash: string; confirmations: number; blockNumber: number | null; from: string | null }
  | { state: 'PENDING'; reason: string }
  | { state: 'REJECTED'; reason: string }

export interface NimExpectation {
  currency: 'NIM'
  /** Recipient Nimiq address. */
  to: string
  /** Luna, as a decimal string. */
  amountMinor: string
  /** The `PACT:<ref>:<milestone>` memo that was written into the data field, if any. */
  memo: string | null
}

export interface UsdtExpectation {
  currency: 'USDT'
  chain: EvmChainKey
  /** Recipient EVM address. */
  toEvm: string
  /** USDT minor units (6 decimals), as a decimal string. */
  amountMinor: string
}

export type Expectation = NimExpectation | UsdtExpectation

export interface VerifierConfig {
  fetch: typeof fetch
  nimiqRpcUrl: string
  evmRpcUrl: (chain: EvmChainKey) => string
  /** Policy, not protocol: how deep a transaction must be before PACT calls it settled. */
  minConfirmations: { nim: number; evm: Record<EvmChainKey, number> }
  timeoutMs: number
}

/**
 * Mainnet NIM tx are checked against network id 24, which is what a live mainnet node
 * reports. A payment that landed on a testnet must not be able to settle a real agreement.
 */
const NIMIQ_MAINNET_NETWORK_ID = 24

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export const DEFAULT_CONFIG: Omit<VerifierConfig, 'fetch'> = {
  nimiqRpcUrl: 'https://rpc.nimiqwatch.com',
  evmRpcUrl: (chain) =>
    ({
      // polygon-rpc.com stopped answering anonymous requests; PublicNode serves the same chain.
      polygon: 'https://polygon-bor-rpc.publicnode.com',
      ethereum: 'https://ethereum-rpc.publicnode.com',
      arbitrum: 'https://arb1.arbitrum.io/rpc',
      optimism: 'https://mainnet.optimism.io',
    })[chain],
  minConfirmations: {
    nim: 2,
    // Reorg depth differs a lot by chain, so one number would be wrong everywhere.
    evm: { polygon: 15, ethereum: 3, arbitrum: 2, optimism: 2 },
  },
  timeoutMs: 9000,
}

class Unreachable extends Error {}

async function rpc<T>(config: VerifierConfig, url: string, method: string, params: unknown[]): Promise<T> {
  let response: Response
  try {
    response = await config.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch {
    throw new Unreachable('the network node did not answer')
  }
  if (!response.ok) throw new Unreachable(`the network node answered ${response.status}`)

  let body: { result?: unknown; error?: { message?: string; data?: unknown } }
  try {
    body = await response.json()
  } catch {
    throw new Unreachable('the network node sent something unreadable')
  }
  if (body.error) {
    const text = `${body.error.message ?? ''} ${typeof body.error.data === 'string' ? body.error.data : ''}`
    // Nimiq nodes report an unknown hash as an internal error carrying "not found".
    if (/not found/i.test(text)) return null as T
    throw new Unreachable('the network node reported an error')
  }
  return body.result as T
}

// --- NIM -------------------------------------------------------------------------------

interface NimTx {
  hash: string
  blockNumber?: number
  confirmations?: number
  from?: string
  to?: string
  value?: number | string
  recipientData?: string
  executionResult?: boolean
  networkId?: number
}

/** Nimiq RPC wraps results as `{ data, metadata }`. */
const unwrapNim = <T>(result: unknown): T | null => {
  if (result == null) return null
  const wrapped = result as { data?: T }
  return wrapped.data === undefined ? (result as T) : (wrapped.data ?? null)
}

function decodeMemo(hexOrText: string | undefined): string {
  if (!hexOrText) return ''
  // The node returns the data field as hex; a few paths return it already decoded.
  if (/^([0-9a-f]{2})+$/i.test(hexOrText)) {
    try {
      return Buffer.from(hexOrText, 'hex').toString('utf8')
    } catch {
      return hexOrText
    }
  }
  return hexOrText
}

function checkNimTx(tx: NimTx, expected: NimExpectation, config: VerifierConfig): VerifyOutcome {
  if (tx.networkId !== undefined && tx.networkId !== NIMIQ_MAINNET_NETWORK_ID) {
    return { state: 'REJECTED', reason: 'That transaction is not on the Nimiq mainnet.' }
  }
  if (tx.executionResult === false) {
    return { state: 'REJECTED', reason: 'The network recorded that transaction as failed.' }
  }
  if (!tx.to || normalizeAddress(tx.to) !== normalizeAddress(expected.to)) {
    return { state: 'REJECTED', reason: 'That transaction paid a different address than this agreement names.' }
  }
  let amount: bigint
  try {
    amount = BigInt(tx.value ?? -1)
  } catch {
    return { state: 'REJECTED', reason: 'That transaction has no readable amount.' }
  }
  if (amount !== BigInt(expected.amountMinor)) {
    return { state: 'REJECTED', reason: 'That transaction paid a different amount than this agreement names.' }
  }
  if (expected.memo !== null && decodeMemo(tx.recipientData).trim() !== expected.memo) {
    return { state: 'REJECTED', reason: 'That transaction does not carry this agreement’s reference.' }
  }

  const confirmations = tx.confirmations ?? 0
  if (!tx.blockNumber || confirmations < config.minConfirmations.nim) {
    return { state: 'PENDING', reason: 'The transaction is on the network but not yet confirmed.' }
  }
  return {
    state: 'CONFIRMED',
    txHash: tx.hash.toLowerCase(),
    confirmations,
    blockNumber: tx.blockNumber,
    from: tx.from ?? null,
  }
}

async function verifyNim(reference: string, expected: NimExpectation, config: VerifierConfig): Promise<VerifyOutcome> {
  const url = config.nimiqRpcUrl
  const ref = reference.trim()

  if (/^[0-9a-f]{64}$/i.test(ref)) {
    const tx = unwrapNim<NimTx>(await rpc(config, url, 'getTransactionByHash', [ref]))
    if (!tx) return { state: 'PENDING', reason: 'The network has not shown this transaction yet.' }
    return checkNimTx(tx, expected, config)
  }

  // The wallet gave back something other than a hash (the SDK types describe a serialized
  // transaction). Without the memo there is nothing safe to match on, so say so rather
  // than guess which payment to the recipient was this one.
  if (expected.memo === null) {
    return { state: 'PENDING', reason: 'PACT cannot identify this payment without a transaction hash.' }
  }

  const history = unwrapNim<NimTx[]>(await rpc(config, url, 'getTransactionsByAddress', [expected.to, 100, null])) ?? []
  const candidate = history.find(
    (tx) =>
      tx.to !== undefined &&
      normalizeAddress(tx.to) === normalizeAddress(expected.to) &&
      String(tx.value) === expected.amountMinor &&
      decodeMemo(tx.recipientData).trim() === expected.memo,
  )
  if (!candidate) return { state: 'PENDING', reason: 'The network has not shown this payment yet.' }
  return checkNimTx(candidate, expected, config)
}

// --- USDT ------------------------------------------------------------------------------

interface EvmLog {
  address: string
  topics: string[]
  data: string
}
interface EvmReceipt {
  status: string
  blockNumber: string
  transactionHash: string
  from?: string
  logs: EvmLog[]
}

const topicToAddress = (topic: string | undefined): string => (topic ? `0x${topic.slice(-40)}`.toLowerCase() : '')

async function verifyUsdt(reference: string, expected: UsdtExpectation, config: VerifierConfig): Promise<VerifyOutcome> {
  const ref = reference.trim()
  if (!/^0x[0-9a-f]{64}$/i.test(ref)) {
    return { state: 'REJECTED', reason: 'That is not a transaction hash.' }
  }
  const url = config.evmRpcUrl(expected.chain)

  const receipt = await rpc<EvmReceipt | null>(config, url, 'eth_getTransactionReceipt', [ref])
  if (!receipt) return { state: 'PENDING', reason: 'The network has not shown this transaction yet.' }
  if (receipt.status !== '0x1') {
    return { state: 'REJECTED', reason: 'The network recorded that transaction as reverted.' }
  }

  const usdt = EVM_CHAINS[expected.chain].usdt.toLowerCase()
  const to = expected.toEvm.toLowerCase()
  const transfer = receipt.logs.find((log) => {
    if (log.address.toLowerCase() !== usdt) return false
    if (log.topics[0] !== TRANSFER_TOPIC) return false
    if (topicToAddress(log.topics[2]) !== to) return false
    try {
      return BigInt(log.data) === BigInt(expected.amountMinor)
    } catch {
      return false
    }
  })
  if (!transfer) {
    return {
      state: 'REJECTED',
      reason: 'That transaction did not move this amount of USDT to the address this agreement names.',
    }
  }

  const head = BigInt(await rpc<string>(config, url, 'eth_blockNumber', []))
  const confirmations = Number(head - BigInt(receipt.blockNumber) + 1n)
  if (confirmations < config.minConfirmations.evm[expected.chain]) {
    return { state: 'PENDING', reason: 'The transaction is on the network but not yet confirmed.' }
  }
  return {
    state: 'CONFIRMED',
    txHash: receipt.transactionHash.toLowerCase(),
    confirmations,
    blockNumber: Number(BigInt(receipt.blockNumber)),
    from: topicToAddress(transfer.topics[1]) || null,
  }
}

// --- entry point -----------------------------------------------------------------------

export async function verifyPayment(
  reference: string,
  expected: Expectation,
  config: VerifierConfig,
): Promise<VerifyOutcome> {
  try {
    return expected.currency === 'NIM'
      ? await verifyNim(reference, expected, config)
      : await verifyUsdt(reference, expected, config)
  } catch (cause) {
    if (cause instanceof Unreachable) {
      return { state: 'PENDING', reason: `Could not check the network just now — ${cause.message}.` }
    }
    // Anything unexpected must still never read as success.
    return { state: 'PENDING', reason: 'Could not check the network just now.' }
  }
}

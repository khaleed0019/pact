import { isNearTxHash, type NearConfig } from './config.ts'

/**
 * Did this NEAR testnet payment actually happen?
 *
 * The same three-outcome contract as `lib/nimiq/verifyPayment.ts`, for the same reason:
 *
 *   CONFIRMED  The chain shows exactly this transfer: signed by the stated payer, to the
 *              agreed recipient, for the agreed amount, executed successfully, final, and
 *              included after the payment was prepared.
 *   PENDING    We cannot say yet — not found, not final, or the node did not answer.
 *              Never treated as success *or* failure.
 *   REJECTED   The chain shows a transaction and it is not this payment.
 *
 * ## What a native NEAR transfer can and cannot prove
 *
 * A plain `Transfer` action carries no memo, so nothing on-chain ties a transfer to a
 * particular mission. PACT links them by (payer, recipient, exact amount, included after
 * the payment intent was created) and refuses to reuse a transaction hash across
 * payments. That is a database link backed by on-chain facts — it is described that way
 * in the UI, never as "on-chain proof of the agreement".
 *
 * ## The response shape this relies on
 *
 * Recorded from the live testnet RPC on 2026-10-24 (`tx` with `wait_until: NONE`):
 * `{ final_execution_status, status, transaction: { signer_id, receiver_id, actions },
 *   transaction_outcome: { block_hash }, receipts_outcome: [{ outcome: { status } }] }`.
 * An unknown hash is a `HANDLER_ERROR` whose `cause.name` is `UNKNOWN_TRANSACTION`.
 *
 * Pure apart from the injected `fetch`, so it is tested against those recorded shapes.
 */

export type NearVerifyOutcome =
  | { state: 'CONFIRMED'; txHash: string; signerId: string; blockHash: string; blockTimestampMs: number }
  | { state: 'PENDING'; reason: string }
  | { state: 'REJECTED'; reason: string }

export interface NearTransferExpectation {
  /** The account the user says they paid from. Checked, not trusted. */
  signerId: string
  receiverId: string
  /** yoctoNEAR, as a decimal string. */
  amountYocto: string
  /** The payment intent's creation time; a transfer included before it is some other payment. */
  notBeforeMs: number
}

export interface NearVerifierDeps {
  fetch: typeof fetch
  config: Pick<NearConfig, 'rpcUrl'>
  timeoutMs?: number
}

type ExecutionStatus = { SuccessValue?: string; SuccessReceiptId?: string; Failure?: unknown } | string

interface TxResult {
  final_execution_status?: string
  status?: ExecutionStatus
  transaction?: {
    hash?: string
    signer_id?: string
    receiver_id?: string
    actions?: Array<Record<string, unknown> | string>
  }
  transaction_outcome?: { block_hash?: string }
  receipts_outcome?: Array<{ outcome?: { status?: ExecutionStatus } }>
}

class Unreachable extends Error {}
class NotFound extends Error {}

async function rpc<T>(deps: NearVerifierDeps, method: string, params: Record<string, unknown>): Promise<T> {
  let response: Response
  try {
    response = await deps.fetch(deps.config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'pact', method, params }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 9000),
    })
  } catch {
    throw new Unreachable('the NEAR node did not answer')
  }
  if (response.status === 429) throw new Unreachable('the NEAR node is rate limiting requests')
  if (!response.ok) throw new Unreachable(`the NEAR node answered ${response.status}`)

  let body: { result?: T; error?: { name?: string; cause?: { name?: string } } }
  try {
    body = await response.json()
  } catch {
    throw new Unreachable('the NEAR node sent something unreadable')
  }
  if (body.error) {
    if (body.error.cause?.name === 'UNKNOWN_TRANSACTION' || body.error.cause?.name === 'UNKNOWN_BLOCK') {
      throw new NotFound()
    }
    throw new Unreachable('the NEAR node reported an error')
  }
  return body.result as T
}

const failed = (status: ExecutionStatus | undefined): boolean =>
  typeof status === 'object' && status !== null && 'Failure' in status

const succeeded = (status: ExecutionStatus | undefined): boolean =>
  typeof status === 'object' && status !== null && ('SuccessValue' in status || 'SuccessReceiptId' in status)

/** Checks the transaction itself. Exported so the matching rules are tested directly. */
export function checkTransfer(tx: TxResult, expected: NearTransferExpectation): NearVerifyOutcome | null {
  const t = tx.transaction
  if (!t) return { state: 'PENDING', reason: 'The NEAR node has not returned this transaction yet.' }

  if (t.signer_id !== expected.signerId) {
    return { state: 'REJECTED', reason: 'That transaction was sent from a different account than the one you named.' }
  }
  if (t.receiver_id !== expected.receiverId) {
    return { state: 'REJECTED', reason: 'That transaction paid a different account than this mission names.' }
  }

  // Exactly one Transfer action, so there is no question about which part was the payment.
  const actions = t.actions ?? []
  const transfers = actions.filter((a) => typeof a === 'object' && a !== null && 'Transfer' in a)
  if (actions.length !== 1 || transfers.length !== 1) {
    return { state: 'REJECTED', reason: 'That transaction is not a single plain NEAR transfer.' }
  }
  const deposit = (transfers[0] as { Transfer?: { deposit?: string } }).Transfer?.deposit
  let amount: bigint
  try {
    amount = BigInt(deposit ?? '-1')
  } catch {
    return { state: 'REJECTED', reason: 'That transaction has no readable amount.' }
  }
  if (amount !== BigInt(expected.amountYocto)) {
    return { state: 'REJECTED', reason: 'That transaction paid a different amount than this mission names.' }
  }

  if (failed(tx.status) || (tx.receipts_outcome ?? []).some((r) => failed(r.outcome?.status))) {
    return { state: 'REJECTED', reason: 'The network recorded that transaction as failed.' }
  }
  if (tx.final_execution_status !== 'FINAL' || !succeeded(tx.status)) {
    return { state: 'PENDING', reason: 'The transaction is on the network but not final yet.' }
  }
  return null
}

export async function verifyNearTransfer(
  txHash: string,
  expected: NearTransferExpectation,
  deps: NearVerifierDeps,
): Promise<NearVerifyOutcome> {
  const hash = txHash.trim()
  if (!isNearTxHash(hash)) return { state: 'REJECTED', reason: 'That is not a NEAR transaction hash.' }

  try {
    const tx = await rpc<TxResult>(deps, 'tx', {
      tx_hash: hash,
      sender_account_id: expected.signerId,
      // NONE answers immediately with whatever the node has; finality is checked below.
      wait_until: 'NONE',
    })
    const problem = checkTransfer(tx, expected)
    if (problem) return problem

    const blockHash = tx.transaction_outcome?.block_hash
    if (!blockHash) return { state: 'PENDING', reason: 'The NEAR node did not say which block included this.' }
    const block = await rpc<{ header?: { timestamp_nanosec?: string } }>(deps, 'block', { block_id: blockHash })
    const nanos = block.header?.timestamp_nanosec
    if (!nanos) return { state: 'PENDING', reason: 'The NEAR node did not return the block time.' }
    // `timestamp` is a JSON number and loses precision; the string field does not.
    const blockTimestampMs = Number(BigInt(nanos) / 1_000_000n)
    if (blockTimestampMs < expected.notBeforeMs) {
      return { state: 'REJECTED', reason: 'That transfer happened before this payment was prepared, so it is a different payment.' }
    }
    return { state: 'CONFIRMED', txHash: hash, signerId: expected.signerId, blockHash, blockTimestampMs }
  } catch (cause) {
    if (cause instanceof NotFound) {
      return { state: 'PENDING', reason: 'NEAR testnet has no transaction with that hash from that account yet.' }
    }
    if (cause instanceof Unreachable) {
      return { state: 'PENDING', reason: `Could not check NEAR testnet just now — ${cause.message}.` }
    }
    return { state: 'PENDING', reason: 'Could not check NEAR testnet just now.' }
  }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyPayment, DEFAULT_CONFIG, type VerifierConfig } from '../lib/nimiq/verifyPayment.ts'

/**
 * Payment verification.
 *
 * The NIM fixture below is the shape of a real mainnet `getTransactionByHash` response,
 * captured from rpc.nimiqwatch.com (hash c6d045de…1780, block 64537380) and then given the
 * recipient, amount and memo these tests need. Using a recorded shape rather than an
 * invented one is the point: a verifier tested only against what its author imagined the
 * node returns will pass against a node that returns something else.
 *
 * What is NOT covered here, and is said so rather than implied: no test sends real money,
 * and the USDT path is built from the ERC-20 Transfer standard rather than from a recorded
 * Polygon response for a PACT payment.
 */

const TO = 'NQ26 0000 0000 02A5 YAK7 4QNF 9MH0 TE2B GVRU'
const HASH = 'c6d045de9392f7bdda6a99fa4746d6bf785bc3c1160963af8f744b6961151780'
const MEMO = 'PACT:KD9Q2P3F:m1'
const memoHex = Buffer.from(MEMO, 'utf8').toString('hex')

const nimTx = (over: Record<string, unknown> = {}) => ({
  hash: HASH,
  blockNumber: 64537380,
  timestamp: 1792330946479,
  confirmations: 24,
  size: 48,
  from: 'NQ81 C01N BASE 0000 0000 0000 0000 0000 0000',
  fromType: 0,
  to: TO,
  toType: 0,
  value: 40000000,
  fee: 0,
  senderData: '',
  recipientData: memoHex,
  flags: 0,
  validityStartHeight: 64537380,
  proof: '',
  networkId: 24,
  executionResult: true,
  ...over,
})

const NIM_EXPECTED = { currency: 'NIM' as const, to: TO, amountMinor: '40000000', memo: MEMO }

/** A fetch that answers JSON-RPC from a method -> result table. */
function chain(table: Record<string, unknown>): VerifierConfig {
  return {
    ...DEFAULT_CONFIG,
    fetch: (async (_url: string, init: { body: string }) => {
      const { method } = JSON.parse(init.body)
      const entry = table[method]
      if (entry instanceof Error) throw entry
      if (entry && typeof entry === 'object' && '__error' in (entry as object)) {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: (entry as { __error: unknown }).__error }))
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: entry }))
    }) as unknown as typeof fetch,
  }
}

const wrap = (data: unknown) => ({ data, metadata: null })

// --- NIM ------------------------------------------------------------------------------

test('a real, matching NIM payment is confirmed from the chain, not from the client', async () => {
  const outcome = await verifyPayment(HASH, NIM_EXPECTED, chain({ getTransactionByHash: wrap(nimTx()) }))
  assert.equal(outcome.state, 'CONFIRMED')
  if (outcome.state === 'CONFIRMED') {
    assert.equal(outcome.txHash, HASH)
    assert.ok(outcome.confirmations >= 2)
  }
})

test('an invented reference cannot confirm a payment', async () => {
  // The original hole: any non-empty string was enough. A hash the chain has never seen
  // must come back PENDING, never CONFIRMED.
  const unknown = { __error: { code: -32603, message: 'Internal error', data: 'Transaction not found: ' + 'a'.repeat(64) } }
  const outcome = await verifyPayment('a'.repeat(64), NIM_EXPECTED, chain({ getTransactionByHash: unknown }))
  assert.equal(outcome.state, 'PENDING')
})

test('a garbage reference cannot confirm anything either', async () => {
  const outcome = await verifyPayment('definitely-paid', NIM_EXPECTED, chain({ getTransactionsByAddress: wrap([]) }))
  assert.equal(outcome.state, 'PENDING')
})

test('a real transaction for a different amount is rejected', async () => {
  const outcome = await verifyPayment(
    HASH,
    NIM_EXPECTED,
    chain({ getTransactionByHash: wrap(nimTx({ value: 1 })) }),
  )
  assert.equal(outcome.state, 'REJECTED')
})

test('a real transaction to a different address is rejected', async () => {
  const outcome = await verifyPayment(
    HASH,
    NIM_EXPECTED,
    chain({ getTransactionByHash: wrap(nimTx({ to: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000' })) }),
  )
  assert.equal(outcome.state, 'REJECTED')
})

test('a real payment carrying a different agreement’s memo is rejected', async () => {
  // Replaying someone else's genuine payment against this agreement.
  const other = Buffer.from('PACT:ZZZZZZZZ:m1', 'utf8').toString('hex')
  const outcome = await verifyPayment(
    HASH,
    NIM_EXPECTED,
    chain({ getTransactionByHash: wrap(nimTx({ recipientData: other })) }),
  )
  assert.equal(outcome.state, 'REJECTED')
})

test('a transaction that was included but failed to execute is rejected', async () => {
  const outcome = await verifyPayment(
    HASH,
    NIM_EXPECTED,
    chain({ getTransactionByHash: wrap(nimTx({ executionResult: false })) }),
  )
  assert.equal(outcome.state, 'REJECTED')
})

test('a transaction on another network is rejected', async () => {
  const outcome = await verifyPayment(
    HASH,
    NIM_EXPECTED,
    chain({ getTransactionByHash: wrap(nimTx({ networkId: 5 })) }),
  )
  assert.equal(outcome.state, 'REJECTED')
})

test('a matching transaction with too few confirmations is pending, not confirmed', async () => {
  const outcome = await verifyPayment(
    HASH,
    NIM_EXPECTED,
    chain({ getTransactionByHash: wrap(nimTx({ confirmations: 0 })) }),
  )
  assert.equal(outcome.state, 'PENDING')
})

test('an unreachable node can neither confirm nor fail a payment', async () => {
  const down: VerifierConfig = {
    ...DEFAULT_CONFIG,
    fetch: (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch,
  }
  const outcome = await verifyPayment(HASH, NIM_EXPECTED, down)
  assert.equal(outcome.state, 'PENDING', 'an outage must not read as success or as failure')
})

test('a node that answers with an error neither confirms nor fails', async () => {
  const broken = { __error: { code: -32000, message: 'database is locked' } }
  const outcome = await verifyPayment(HASH, NIM_EXPECTED, chain({ getTransactionByHash: broken }))
  assert.equal(outcome.state, 'PENDING')
})

test('when the wallet returns a serialized transaction, the payment is found by amount and memo', async () => {
  // The SDK types ship saying "serialized transaction"; the docs say "hash". Both must work.
  const serialized = '00'.repeat(120)
  const outcome = await verifyPayment(serialized, NIM_EXPECTED, chain({ getTransactionsByAddress: wrap([nimTx()]) }))
  assert.equal(outcome.state, 'CONFIRMED')
  if (outcome.state === 'CONFIRMED') assert.equal(outcome.txHash, HASH, 'the canonical hash comes off the chain')
})

test('the history fallback will not guess without a memo to match on', async () => {
  const outcome = await verifyPayment(
    '00'.repeat(120),
    { ...NIM_EXPECTED, memo: null },
    chain({ getTransactionsByAddress: wrap([nimTx()]) }),
  )
  assert.equal(outcome.state, 'PENDING')
})

// --- USDT -----------------------------------------------------------------------------

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const USDT_POLYGON = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
const EVM_TO = '0xd0c0000000000000000000000000000000000003'
const EVM_FROM = '0xd0c0000000000000000000000000000000000001'
const TX = '0x' + 'ab'.repeat(32)
const pad = (a: string) => '0x' + a.slice(2).toLowerCase().padStart(64, '0')

const receipt = (over: Record<string, unknown> = {}) => ({
  status: '0x1',
  blockNumber: '0x100',
  transactionHash: TX,
  logs: [
    {
      address: USDT_POLYGON,
      topics: [TRANSFER, pad(EVM_FROM), pad(EVM_TO)],
      data: '0x' + (150_000_000).toString(16),
    },
  ],
  ...over,
})

const USDT_EXPECTED = { currency: 'USDT' as const, chain: 'polygon' as const, toEvm: EVM_TO, amountMinor: '150000000' }
const head = (n: number) => '0x' + n.toString(16)

test('a real USDT transfer to the right address for the right amount is confirmed', async () => {
  const outcome = await verifyPayment(
    TX,
    USDT_EXPECTED,
    chain({ eth_getTransactionReceipt: receipt(), eth_blockNumber: head(0x100 + 40) }),
  )
  assert.equal(outcome.state, 'CONFIRMED')
})

test('a USDT transfer for the wrong amount is rejected', async () => {
  const outcome = await verifyPayment(
    TX,
    { ...USDT_EXPECTED, amountMinor: '1' },
    chain({ eth_getTransactionReceipt: receipt(), eth_blockNumber: head(0x100 + 40) }),
  )
  assert.equal(outcome.state, 'REJECTED')
})

test('a USDT transfer to a different address is rejected', async () => {
  const outcome = await verifyPayment(
    TX,
    { ...USDT_EXPECTED, toEvm: '0x' + '11'.repeat(20) },
    chain({ eth_getTransactionReceipt: receipt(), eth_blockNumber: head(0x100 + 40) }),
  )
  assert.equal(outcome.state, 'REJECTED')
})

test('a transfer of some other token is not accepted as USDT', async () => {
  const fake = receipt({
    logs: [
      {
        address: '0x' + '22'.repeat(20),
        topics: [TRANSFER, pad(EVM_FROM), pad(EVM_TO)],
        data: '0x' + (150_000_000).toString(16),
      },
    ],
  })
  const outcome = await verifyPayment(
    TX,
    USDT_EXPECTED,
    chain({ eth_getTransactionReceipt: fake, eth_blockNumber: head(0x100 + 40) }),
  )
  assert.equal(outcome.state, 'REJECTED', 'the token contract has to be the real USDT contract')
})

test('a reverted USDT transaction is rejected', async () => {
  const outcome = await verifyPayment(
    TX,
    USDT_EXPECTED,
    chain({ eth_getTransactionReceipt: receipt({ status: '0x0' }), eth_blockNumber: head(0x100 + 40) }),
  )
  assert.equal(outcome.state, 'REJECTED')
})

test('a USDT transaction with no receipt yet is pending', async () => {
  const outcome = await verifyPayment(TX, USDT_EXPECTED, chain({ eth_getTransactionReceipt: null }))
  assert.equal(outcome.state, 'PENDING')
})

test('a fresh USDT transfer is pending until it is buried deep enough', async () => {
  const outcome = await verifyPayment(
    TX,
    USDT_EXPECTED,
    chain({ eth_getTransactionReceipt: receipt(), eth_blockNumber: head(0x100 + 1) }),
  )
  assert.equal(outcome.state, 'PENDING')
})

test('a USDT reference that is not a hash is rejected outright', async () => {
  const outcome = await verifyPayment('paid!', USDT_EXPECTED, chain({}))
  assert.equal(outcome.state, 'REJECTED')
})

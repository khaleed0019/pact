import test from 'node:test'
import assert from 'node:assert/strict'
import { MemoryRepository } from '../lib/db/memory.ts'
import { isRepoError, type CreatePactInput } from '../lib/db/repo.ts'
import { reconcilePayment } from '../lib/api/reconcile.ts'
import { canPaymentTransition } from '../lib/pact/paymentState.ts'
import { DEFAULT_CONFIG, type VerifierConfig } from '../lib/nimiq/verifyPayment.ts'

/**
 * The payment lifecycle, end to end against a fake chain.
 *
 * The property under test is the one the product stands on: a payment becomes CONFIRMED
 * only because the network said so, never because somebody asked, and once confirmed it
 * cannot be undone or counted twice.
 */

const CLIENT = 'NQ340000000000000000000000000000000'
const PROVIDER = 'NQ26 0000 0000 02A5 YAK7 4QNF 9MH0 TE2B GVRU'
const HASH = 'c6d045de9392f7bdda6a99fa4746d6bf785bc3c1160963af8f744b6961151780'

function draft(): CreatePactInput {
  return {
    createdBy: CLIENT,
    category: 'FREELANCE',
    creatorRole: 'CLIENT',
    creatorName: 'Khaleed',
    counterpartyName: 'John',
    counterpartyAddress: PROVIDER,
    title: 'Website design',
    deliverable: 'A five page marketing site',
    currency: 'NIM',
    chain: null,
    totalAmountMinor: '40000000',
    deadline: '2026-09-20',
    paymentCondition: 'After final approval',
    specialTerms: [],
    milestones: [],
  }
}

const nimTx = (over: Record<string, unknown> = {}, hash = HASH) => ({
  hash,
  blockNumber: 64537380,
  confirmations: 24,
  to: PROVIDER,
  value: 40000000,
  recipientData: '',
  networkId: 24,
  executionResult: true,
  ...over,
})

/** A chain that answers getTransactionByHash with whatever `tx` currently is. */
function chain(tx: () => unknown): VerifierConfig {
  return {
    ...DEFAULT_CONFIG,
    fetch: (async (_u: string, init: { body: string }) => {
      const { method } = JSON.parse(init.body)
      if (method !== 'getTransactionByHash') return new Response(JSON.stringify({ result: { data: [], metadata: null } }))
      const value = tx()
      if (value instanceof Error) throw value
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { data: value, metadata: null } }))
    }) as unknown as typeof fetch,
  }
}

async function submitted(reference = HASH) {
  const repo = new MemoryRepository()
  const pact = await repo.createPact(draft())
  const payment = await repo.recordPayment({
    pactId: pact.id,
    milestoneId: null,
    fromAddress: CLIENT,
    toAddress: PROVIDER,
    amountMinor: '40000000',
    currency: 'NIM',
    chain: null,
    memo: null,
    idempotencyKey: `k-${Math.random()}`,
  })
  await repo.updatePaymentStatus({ paymentId: payment.id, status: 'SUBMITTED', txReference: reference })
  return { repo, pact, payment }
}

test('the payment graph has no edge into CONFIRMED except from SUBMITTED, and none out of it', () => {
  assert.equal(canPaymentTransition('PENDING', 'CONFIRMED'), false)
  assert.equal(canPaymentTransition('SUBMITTED', 'CONFIRMED'), true)
  for (const to of ['PENDING', 'SUBMITTED', 'FAILED', 'CANCELLED'] as const) {
    assert.equal(canPaymentTransition('CONFIRMED', to), false)
  }
  assert.equal(canPaymentTransition('SUBMITTED', 'CANCELLED'), false, 'a payment that has left cannot be cancelled')
})

test('a payment cannot jump from PENDING to CONFIRMED', async () => {
  const { repo, payment } = await submitted()
  const fresh = await repo.recordPayment({
    pactId: payment.pactId,
    milestoneId: null,
    fromAddress: CLIENT,
    toAddress: PROVIDER,
    amountMinor: '1',
    currency: 'NIM',
    chain: null,
    memo: null,
    idempotencyKey: 'another',
  })
  await assert.rejects(
    repo.updatePaymentStatus({ paymentId: fresh.id, status: 'CONFIRMED', txReference: HASH }),
    (e) => isRepoError(e) && e.kind === 'CONFLICT',
  )
})

test('a matching on-chain payment is confirmed and recorded once', async () => {
  const { repo, pact, payment } = await submitted()
  const first = await reconcilePayment(repo, payment.id, chain(() => nimTx()))
  assert.equal(first.payment.status, 'CONFIRMED')

  const again = await reconcilePayment(repo, payment.id, chain(() => nimTx()))
  assert.equal(again.payment.status, 'CONFIRMED')
  assert.equal(again.outcome, null, 'a settled payment is not re-checked')

  const confirmations = (await repo.getPactById(pact.id))!.activities.filter((a) => a.kind === 'PAYMENT_CONFIRMED')
  assert.equal(confirmations.length, 1, 'confirming twice must not narrate twice')
})

test('an invented reference stays submitted — it is never confirmed or failed on a guess', async () => {
  const { repo, payment } = await submitted('definitely-paid')
  const result = await reconcilePayment(repo, payment.id, chain(() => null))
  assert.equal(result.payment.status, 'SUBMITTED')
  assert.equal(result.outcome?.state, 'PENDING')
})

test('an unreachable network leaves the payment submitted', async () => {
  const { repo, payment } = await submitted()
  const result = await reconcilePayment(repo, payment.id, chain(() => new Error('ECONNREFUSED')))
  assert.equal(result.payment.status, 'SUBMITTED')
})

test('a real transaction for the wrong amount fails the payment', async () => {
  const { repo, payment } = await submitted()
  const result = await reconcilePayment(repo, payment.id, chain(() => nimTx({ value: 5 })))
  assert.equal(result.payment.status, 'FAILED')
})

test('a confirmed payment can never be flipped to failed', async () => {
  const { repo, payment } = await submitted()
  await reconcilePayment(repo, payment.id, chain(() => nimTx()))
  await assert.rejects(
    repo.updatePaymentStatus({ paymentId: payment.id, status: 'FAILED', failureReason: 'changed my mind' }),
    (e) => isRepoError(e) && e.kind === 'CONFLICT',
  )
  assert.equal((await repo.getPaymentById(payment.id))!.status, 'CONFIRMED')
})

test('one on-chain transaction cannot settle two payments', async () => {
  const a = await submitted()
  await reconcilePayment(a.repo, a.payment.id, chain(() => nimTx()))

  const second = await a.repo.recordPayment({
    pactId: a.pact.id,
    milestoneId: null,
    fromAddress: CLIENT,
    toAddress: PROVIDER,
    amountMinor: '40000000',
    currency: 'NIM',
    chain: null,
    memo: null,
    idempotencyKey: 'second',
  })
  await a.repo.updatePaymentStatus({ paymentId: second.id, status: 'SUBMITTED', txReference: HASH })

  const result = await reconcilePayment(a.repo, second.id, chain(() => nimTx()))
  assert.equal(result.payment.status, 'FAILED', 'the replayed transaction is refused, not double-counted')
})

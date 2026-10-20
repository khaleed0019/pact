import test from 'node:test'
import assert from 'node:assert/strict'
import { MemoryRepository } from '../lib/db/memory.ts'
import { progressOf } from '../lib/pact/progress.ts'
import type { CreatePactInput } from '../lib/db/repo.ts'

/**
 * The agreement stepper. What matters: nothing is shown done before the stored rows say
 * so, and "sent" never reaches "verified" without the network's confirmation.
 */

const CLIENT = 'NQ340000000000000000000000000000000'
const PROVIDER = 'NQ260000000000000000000000000000000'

const draft = (over: Partial<CreatePactInput> = {}): CreatePactInput => ({
  createdBy: CLIENT, category: 'FREELANCE', creatorRole: 'CLIENT', creatorName: 'C', counterpartyName: 'P',
  counterpartyAddress: PROVIDER, title: 'Job', deliverable: 'Thing', currency: 'NIM', chain: null,
  totalAmountMinor: '100000', deadline: null, paymentCondition: '', specialTerms: [], milestones: [], ...over,
})

const state = (steps: ReturnType<typeof progressOf>, key: string) => steps.find((s) => s.key === key)?.state

async function sealed(repo: MemoryRepository, over: Partial<CreatePactInput> = {}) {
  const pact = await repo.createPact(draft(over))
  await repo.setStatus(pact.id, CLIENT, 'PENDING')
  await repo.recordSeal({ pactId: pact.id, address: CLIENT, signature: 'a'.repeat(128), publicKey: 'b'.repeat(64) })
  await repo.recordSeal({ pactId: pact.id, address: PROVIDER, signature: 'c'.repeat(128), publicKey: 'd'.repeat(64) })
  return pact
}

test('a new agreement shows signing as the current step and nothing after it as done', async () => {
  const repo = new MemoryRepository()
  const pact = (await repo.getPactById((await repo.createPact(draft())).id))!
  const steps = progressOf(pact)
  assert.equal(state(steps, 'signed'), 'current')
  for (const key of ['submitted', 'reviewed', 'sent', 'verified']) assert.equal(state(steps, key), 'upcoming')
})

test('a sent payment sits on "sent", short of "verified", until the network confirms', async () => {
  const repo = new MemoryRepository()
  const pact = await sealed(repo)
  const d = await repo.submitDeliverable({ pactId: pact.id, milestoneId: null, submittedBy: PROVIDER, note: 'n', link: null })
  await repo.reviewDeliverable({ deliverableId: d.id, actor: CLIENT, status: 'APPROVED', reviewNote: null })
  const payment = await repo.recordPayment({
    pactId: pact.id, milestoneId: null, fromAddress: CLIENT, toAddress: PROVIDER, amountMinor: '100000',
    currency: 'NIM', chain: null, memo: null, idempotencyKey: 'p1',
  })
  await repo.updatePaymentStatus({ paymentId: payment.id, status: 'SUBMITTED', txReference: 'a'.repeat(64) })

  let steps = progressOf((await repo.getPactById(pact.id))!)
  assert.equal(state(steps, 'sent'), 'done')
  assert.equal(state(steps, 'verified'), 'current', 'sent is not verified')

  await repo.updatePaymentStatus({ paymentId: payment.id, status: 'CONFIRMED', txReference: 'a'.repeat(64) })
  steps = progressOf((await repo.getPactById(pact.id))!)
  assert.equal(state(steps, 'verified'), 'done')
})

test('changes requested is flagged, not shown as approved', async () => {
  const repo = new MemoryRepository()
  const pact = await sealed(repo)
  const d = await repo.submitDeliverable({ pactId: pact.id, milestoneId: null, submittedBy: PROVIDER, note: 'n', link: null })
  await repo.reviewDeliverable({ deliverableId: d.id, actor: CLIENT, status: 'CHANGES_REQUESTED', reviewNote: 'Add captions' })
  const steps = progressOf((await repo.getPactById(pact.id))!)
  assert.equal(state(steps, 'reviewed'), 'attention')
  assert.match(steps.find((s) => s.key === 'reviewed')!.detail, /captions/)
})

test('an agreement without money has no payment steps at all', async () => {
  const repo = new MemoryRepository()
  const pact = (await repo.getPactById((await repo.createPact(draft({ category: 'COMMITMENT', totalAmountMinor: '0' }))).id))!
  const keys = progressOf(pact).map((s) => s.key)
  assert.ok(!keys.includes('sent') && !keys.includes('verified'))
})

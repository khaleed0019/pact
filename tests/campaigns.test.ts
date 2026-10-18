import test from 'node:test'
import assert from 'node:assert/strict'
import { MemoryRepository } from '../lib/db/memory.ts'
import { isRepoError } from '../lib/db/repo.ts'
import { MemoryCampaignStore } from '../lib/campaigns/memory.ts'
import { canCampaignTransition } from '../lib/campaigns/model.ts'
import { claimCampaign, overviewOf, termsFromCampaign } from '../lib/campaigns/service.ts'
import { reconcilePayment } from '../lib/api/reconcile.ts'
import { DEFAULT_CONFIG } from '../lib/nimiq/verifyPayment.ts'
import { createCampaignSchema } from '../lib/api/schema.ts'

const BRAND = 'NQ340000000000000000000000000000000'
const ALICE = 'NQ260000000000000000000000000000000'
const BOB = 'NQ710000000000000000000000000000000'
const CAROL = 'NQ070000000000000000000000000000000'
const TODAY = '2026-10-18'

function setup(slots = 2) {
  const repo = new MemoryRepository()
  const store = new MemoryCampaignStore(async (id) => (await repo.getPactById(id))?.status ?? null)
  const make = (over: Partial<Parameters<typeof store.createCampaign>[0]> = {}) =>
    store.createCampaign({
      ownerAddress: BRAND,
      ownerName: 'Acme',
      title: 'Post a thread about us',
      brief: 'Write an honest thread.',
      requirements: ['Mention the launch', 'Link the site'],
      currency: 'NIM',
      chain: null,
      rewardMinor: '40000000',
      slots,
      deadline: null,
      ...over,
    })
  const claim = (campaignId: string, who: string, name = 'Jobber') =>
    claimCampaign(repo, store, { campaignId, jobberAddress: who, jobberName: name, today: TODAY })
  return { repo, store, make, claim }
}

const code = (kind: string) => (e: unknown) => isRepoError(e) && e.kind === kind

test('taking a campaign up creates an ordinary two-party agreement with the brand', async () => {
  const { make, claim } = setup()
  const c = await make()
  const { pact } = await claim(c.id, ALICE, 'Alice')
  assert.equal(pact.title, c.title)
  assert.equal(pact.totalAmountMinor, c.rewardMinor)
  assert.equal(pact.participants.find((p) => p.role === 'PROVIDER')?.displayName, 'Alice')
  assert.equal(pact.participants.find((p) => p.role === 'CLIENT')?.address, BRAND)
  assert.ok(pact.participants.every((p) => p.sealSignature === null), 'not in force until both sign')
  assert.match(pact.deliverable, /Mention the launch/)
})

test('a campaign cannot be taken up more times than it has spots', async () => {
  const { make, claim } = setup(2)
  const c = await make()
  await claim(c.id, ALICE)
  await claim(c.id, BOB)
  await assert.rejects(claim(c.id, CAROL), code('CONFLICT'))
})

test('people racing for the last spot cannot all get it', async () => {
  const { make, claim } = setup(1)
  const c = await make({ slots: 1 })
  const results = await Promise.allSettled([claim(c.id, ALICE), claim(c.id, BOB), claim(c.id, CAROL)])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
})

test('one person cannot take the same campaign up twice', async () => {
  const { make, claim } = setup(5)
  const c = await make({ slots: 5 })
  await claim(c.id, ALICE)
  await assert.rejects(claim(c.id, ALICE), code('CONFLICT'))
})

test('the brand cannot take up its own campaign', async () => {
  const { make, claim } = setup()
  const c = await make()
  await assert.rejects(claim(c.id, BRAND), code('NOT_ALLOWED'))
})

test('a paused or expired campaign takes no one new', async () => {
  const { make, claim, store } = setup()
  const c = await make()
  await store.setStatus(c.id, 'PAUSED')
  await assert.rejects(claim(c.id, ALICE), code('NOT_ALLOWED'))
  await store.setStatus(c.id, 'OPEN')
  await claim(c.id, ALICE)

  const old = await make({ deadline: '2026-01-01' })
  await assert.rejects(claim(old.id, BOB), code('CONFLICT'))
})

test('a spot comes back when the agreement made from it is declined', async () => {
  const { make, claim, repo } = setup(1)
  const c = await make({ slots: 1 })
  const { pact } = await claim(c.id, ALICE)
  await assert.rejects(claim(c.id, BOB), code('CONFLICT'))

  await repo.setStatus(pact.id, BRAND, 'DECLINED')
  await claim(c.id, BOB)
})

test('a failed agreement creation gives the spot back', async () => {
  const { make, store, claim } = setup(1)
  const c = await make({ slots: 1 })
  const failing = {
    createPact: async () => {
      throw new Error('boom')
    },
  } as never
  await assert.rejects(claimCampaign(failing, store, { campaignId: c.id, jobberAddress: ALICE, jobberName: 'A', today: TODAY }))
  await claim(c.id, BOB)
})

test('campaign status moves only along allowed edges', () => {
  assert.equal(canCampaignTransition('OPEN', 'PAUSED'), true)
  assert.equal(canCampaignTransition('PAUSED', 'OPEN'), true)
  assert.equal(canCampaignTransition('CLOSED', 'OPEN'), false)
  assert.equal(canCampaignTransition('CANCELLED', 'OPEN'), false)
})

test('budget: committed follows spots taken, paid follows the network only', async () => {
  const { make, claim, store, repo } = setup(3)
  const c = await make({ slots: 3 })
  const { pact } = await claim(c.id, ALICE)
  await claim(c.id, BOB)

  let view = await overviewOf(repo, store, c)
  assert.equal(view.budget.committedMinor, '80000000')
  assert.equal(view.budget.ceilingMinor, '120000000')
  assert.equal(view.budget.open, 1)
  assert.equal(view.budget.paidMinor, '0')

  const payment = await repo.recordPayment({
    pactId: pact.id,
    milestoneId: null,
    fromAddress: BRAND,
    toAddress: ALICE,
    amountMinor: '40000000',
    currency: 'NIM',
    chain: null,
    memo: null,
    idempotencyKey: 'c1',
  })
  await repo.updatePaymentStatus({ paymentId: payment.id, status: 'SUBMITTED', txReference: 'a'.repeat(64) })
  view = await overviewOf(repo, store, c)
  assert.equal(view.budget.paidMinor, '0', 'sent is not paid')
  assert.equal(view.claims.find((x) => x.pactId === pact.id)?.paymentSubmitted, true)

  await reconcilePayment(repo, payment.id, {
    ...DEFAULT_CONFIG,
    fetch: (async () => {
      throw new Error('down')
    }) as unknown as typeof fetch,
  })
  view = await overviewOf(repo, store, c)
  assert.equal(view.budget.paidMinor, '0', 'an unreachable network confirms nothing')
})

test('campaign input is bounded so the agreement made from it always fits', async () => {
  const input = createCampaignSchema.parse({
    ownerName: 'A'.repeat(80),
    title: 'T'.repeat(140),
    brief: 'B'.repeat(1000),
    requirements: Array.from({ length: 8 }, () => 'R'.repeat(120)),
    currency: 'NIM',
    chain: null,
    rewardMinor: '1',
    slots: 1,
    deadline: null,
  })
  const { make } = setup()
  const c = await make({ brief: input.brief, requirements: input.requirements })
  assert.ok(termsFromCampaign(c).deliverable.length <= 2000)
  assert.throws(() => createCampaignSchema.parse({ ...input, currency: 'USDT', chain: null }))
  assert.throws(() => createCampaignSchema.parse({ ...input, rewardMinor: '0' }))
})

test('the brand is told, and the pact points back at its campaign', async () => {
  const { make, claim, repo, store } = setup()
  const c = await make()
  const { pact } = await claim(c.id, ALICE, 'Alice')

  const nudges = await repo.refreshNotifications(BRAND)
  const waiting = nudges.find((n) => n.pactId === pact.id && n.kind === 'ACCEPTANCE_PENDING')
  assert.ok(waiting, 'someone taking the campaign up reaches the brand as a signature request')
  assert.equal((await repo.refreshNotifications(ALICE)).some((n) => n.pactId === pact.id && n.kind === 'ACCEPTANCE_PENDING'), false, 'not the person who made it')

  assert.equal((await store.getClaimByPact(pact.id))?.campaignId, c.id)
})

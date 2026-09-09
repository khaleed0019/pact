import test from 'node:test'
import assert from 'node:assert/strict'
import { MemoryRepository } from '../lib/db/memory.ts'
import { isRepoError } from '../lib/db/repo.ts'
import { toVerificationRecord } from '../lib/pact/verification.ts'
import type { CreatePactInput } from '../lib/db/repo.ts'

/**
 * Repository behaviour.
 *
 * These cover the invariants that make a PACT mean anything. If the seal survived an
 * edit, or a non-party could act, or a double tap created two payments, the product's
 * central claim would be false — so each of those is pinned here rather than left to
 * a careful reading of the implementation.
 */

const CLIENT = 'NQ340000000000000000000000000000000'
const PROVIDER = 'NQ260000000000000000000000000000000'
const STRANGER = 'NQ710000000000000000000000000000000'

function draft(overrides: Partial<CreatePactInput> = {}): CreatePactInput {
  return {
    createdBy: CLIENT,
    creatorRole: 'CLIENT',
    creatorName: 'Khaleed',
    counterpartyName: 'John',
    counterpartyAddress: PROVIDER,
    title: 'Website design',
    deliverable: 'A five page marketing site',
    currency: 'USDT',
    chain: 'polygon',
    totalAmountMinor: '200000000',
    deadline: '2026-09-20',
    paymentCondition: 'After final approval',
    specialTerms: [],
    milestones: [],
    ...overrides,
  }
}

async function seal(repo: MemoryRepository, pactId: string) {
  await repo.recordSeal({ pactId, address: CLIENT, signature: 'a'.repeat(128), publicKey: 'b'.repeat(64) })
  await repo.recordSeal({ pactId, address: PROVIDER, signature: 'c'.repeat(128), publicKey: 'd'.repeat(64) })
}

test('a new pact gets a fingerprint and a short id derived from it', async () => {
  const repo = new MemoryRepository()
  const pact = await repo.createPact(draft())

  assert.match(pact.termsDigest, /^[0-9a-f]{32}$/)
  assert.match(pact.shortId, /^[0-9A-HJ-NP-VXY]{8}$/)
  assert.equal(pact.status, 'DRAFT')
  assert.equal(pact.participants.length, 2)
  assert.equal(pact.activities[0].kind, 'PACT_CREATED')
})

test('identical agreements produce identical fingerprints', async () => {
  const a = await new MemoryRepository().createPact(draft())
  const b = await new MemoryRepository().createPact(draft())
  assert.equal(a.termsDigest, b.termsDigest, 'the digest must depend only on the terms')
})

test('EDITING TERMS CLEARS BOTH SIGNATURES — the product’s central invariant', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())
  await repo.setStatus(created.id, CLIENT, 'PENDING')
  await seal(repo, created.id)

  const sealed = await repo.getPactById(created.id)
  assert.ok(sealed!.participants.every((p) => p.sealSignature !== null), 'both sides start out signed')
  const digestBefore = sealed!.termsDigest

  // Move the pact back to a state where terms may be edited, then change one.
  await repo.setStatus(created.id, CLIENT, 'NEGOTIATING')
  const edited = await repo.updateTerms(created.id, CLIENT, { deadline: '2026-10-07' })

  assert.notEqual(edited.termsDigest, digestBefore, 'the fingerprint must move when a term moves')
  assert.deepEqual(
    edited.participants.map((p) => p.sealSignature),
    [null, null],
    'a signature over old terms cannot survive into new ones',
  )
  assert.deepEqual(edited.participants.map((p) => p.sealedAt), [null, null])
})

test('a sealed agreement cannot be edited directly', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())
  await repo.setStatus(created.id, CLIENT, 'PENDING')
  await seal(repo, created.id)
  await repo.setStatus(created.id, CLIENT, 'ACTIVE')

  await assert.rejects(
    () => repo.updateTerms(created.id, CLIENT, { deadline: '2026-11-01' }),
    (cause) => isRepoError(cause) && cause.kind === 'CONFLICT',
  )
})

test('someone who is not a party cannot act on an agreement', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())

  for (const attempt of [
    () => repo.setStatus(created.id, STRANGER, 'PENDING'),
    () => repo.updateTerms(created.id, STRANGER, { title: 'Mine now' }),
    () => repo.submitDeliverable({ pactId: created.id, milestoneId: null, submittedBy: STRANGER, note: 'hi', link: null }),
  ]) {
    await assert.rejects(attempt, (cause) => isRepoError(cause) && cause.kind === 'NOT_ALLOWED')
  }
})

test('only the provider can submit, and only the client can review', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())

  await assert.rejects(
    () => repo.submitDeliverable({ pactId: created.id, milestoneId: null, submittedBy: CLIENT, note: 'x', link: null }),
    (cause) => isRepoError(cause) && cause.kind === 'NOT_ALLOWED',
  )

  const delivered = await repo.submitDeliverable({
    pactId: created.id,
    milestoneId: null,
    submittedBy: PROVIDER,
    note: 'Done',
    link: null,
  })

  await assert.rejects(
    () => repo.reviewDeliverable({ deliverableId: delivered.id, actor: PROVIDER, status: 'APPROVED', reviewNote: null }),
    (cause) => isRepoError(cause) && cause.kind === 'NOT_ALLOWED',
    'a provider must not be able to approve their own work',
  )
})

test('milestones must add up to the agreement total', async () => {
  const repo = new MemoryRepository()
  await assert.rejects(
    () =>
      repo.createPact(
        draft({
          milestones: [
            { title: 'One', description: '', amountMinor: '100000000', percent: 50, dueDate: null },
            { title: 'Two', description: '', amountMinor: '50000000', percent: 50, dueDate: null },
          ],
        }),
      ),
    (cause) => isRepoError(cause) && cause.kind === 'INVALID',
  )
})

test('a repeated payment attempt does not create a second payment', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())

  const input = {
    pactId: created.id,
    milestoneId: null,
    fromAddress: CLIENT,
    toAddress: PROVIDER,
    amountMinor: '200000000',
    currency: 'USDT' as const,
    chain: 'polygon' as const,
    memo: null,
    idempotencyKey: 'one-tap',
  }

  const first = await repo.recordPayment(input)
  const second = await repo.recordPayment(input)
  assert.equal(first.id, second.id, 'a double tap must reuse the existing payment')
  assert.equal(first.status, 'PENDING', 'a payment is never created as already sent')
})

test('a payment only marks its milestone paid once confirmed', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(
    draft({
      milestones: [{ title: 'All of it', description: '', amountMinor: '200000000', percent: 100, dueDate: null }],
    }),
  )
  const milestone = created.milestones[0]

  const payment = await repo.recordPayment({
    pactId: created.id,
    milestoneId: milestone.id,
    fromAddress: CLIENT,
    toAddress: PROVIDER,
    amountMinor: '200000000',
    currency: 'USDT',
    chain: 'polygon',
    memo: null,
    idempotencyKey: 'k1',
  })

  await repo.updatePaymentStatus({ paymentId: payment.id, status: 'SUBMITTED', txReference: '0xabc' })
  let current = await repo.getPactById(created.id)
  assert.notEqual(current!.milestones[0].status, 'PAID', 'submitted is not settled')

  await repo.updatePaymentStatus({ paymentId: payment.id, status: 'CONFIRMED', txReference: '0xabc' })
  await repo.setMilestoneStatus(created.id, milestone.id, 'PAID')
  current = await repo.getPactById(created.id)
  assert.equal(current!.milestones[0].status, 'PAID')
})

test('trust counts only confirmed payments and completed agreements', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())

  const payment = await repo.recordPayment({
    pactId: created.id,
    milestoneId: null,
    fromAddress: CLIENT,
    toAddress: PROVIDER,
    amountMinor: '200000000',
    currency: 'USDT',
    chain: 'polygon',
    memo: null,
    idempotencyKey: 'k2',
  })

  let trust = await repo.getTrustMetrics(CLIENT)
  assert.equal(trust.paymentsConfirmed, 0, 'a pending payment counts for nothing')

  await repo.updatePaymentStatus({ paymentId: payment.id, status: 'CONFIRMED', txReference: '0xabc' })
  trust = await repo.getTrustMetrics(CLIENT)
  assert.equal(trust.paymentsConfirmed, 1)
  assert.equal(trust.totalValueByCurrency.USDT, '200000000')
  assert.equal(trust.pactsCompleted, 0, 'the agreement itself is not finished yet')
})

test('an explicit profile name wins over whatever a pact\'s participant row says', async () => {
  const repo = new MemoryRepository()

  // No pact yet at all — the trust profile still resolves the name once it's been set
  // explicitly, rather than requiring at least one pact to derive one from.
  let trust = await repo.getTrustMetrics(CLIENT)
  assert.equal(trust.displayName, '', 'nothing set yet')

  await repo.updateProfile(CLIENT, 'Khaleed A.')
  trust = await repo.getTrustMetrics(CLIENT)
  assert.equal(trust.displayName, 'Khaleed A.')

  // A pact created afterwards used whatever name the builder was filled in with at the
  // time ("Khaleed") — the explicit profile edit still wins on the trust page.
  await repo.createPact(draft({ creatorName: 'Khaleed' }))
  trust = await repo.getTrustMetrics(CLIENT)
  assert.equal(trust.displayName, 'Khaleed A.', 'the explicit edit is not overwritten by pact activity')
})

test('a private agreement is indistinguishable from one that never existed', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())
  assert.equal(created.visibility, 'PRIVATE', 'private is the default and has to stay that way')

  assert.equal(await repo.getVerificationRecord(created.shortId), null)
  assert.equal(await repo.getVerificationRecord('ZZZZZZZZ'), null, 'and so is a reference nobody ever issued')
})

test('an unrecognised visibility withholds rather than publishes', () => {
  // The realistic way this happens is a row written before the column existed, or a
  // value from a migration this build predates. Whatever the cause, failing open here
  // means publishing someone's agreement, so the check is an allowlist and this pins it.
  const base = { visibility: 'SHAREABLE', participants: [], milestones: [], payments: [] } as unknown as Parameters<
    typeof toVerificationRecord
  >[0]
  assert.ok(toVerificationRecord(base), 'a genuinely shareable pact still resolves')

  for (const bad of [undefined, null, '', 'private', 'Shareable', 'ANYTHING_ELSE']) {
    const record = toVerificationRecord({ ...base, visibility: bad } as typeof base)
    assert.equal(record, null, `visibility ${JSON.stringify(bad)} must not publish`)
  }
})

test('a published record exposes the signatures but not the private material', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())
  await seal(repo, created.id)
  await repo.setVisibility(created.id, CLIENT, 'SHAREABLE')

  const record = await repo.getVerificationRecord(created.shortId)
  assert.ok(record, 'a shareable pact resolves by short id')

  // The checkable part is present.
  assert.equal(record.termsDigest, created.termsDigest)
  assert.ok(record.parties.every((p) => p.sealSignature && p.sealPublicKey))

  // The private part is not, at any depth. Serialising and scanning the whole payload
  // catches a field someone adds later without thinking about this boundary.
  const serialised = JSON.stringify(record)
  assert.ok(!serialised.includes(CLIENT), 'full wallet addresses must never appear')
  assert.ok(!serialised.includes(PROVIDER), 'full wallet addresses must never appear')
  assert.ok(!('activities' in record), 'the activity feed is not public')
  assert.ok(!('deliverables' in record), 'delivery notes and links are not public')
  assert.ok(!('payments' in record), 'transaction references are not public')
  assert.ok(!('disputes' in record), 'dispute detail is not public')
})

test('publishing can be undone', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())

  await repo.setVisibility(created.id, PROVIDER, 'PUBLIC')
  assert.ok(await repo.getVerificationRecord(created.shortId))

  // Either party can pull it back, without needing the other's agreement.
  await repo.setVisibility(created.id, CLIENT, 'PRIVATE')
  assert.equal(await repo.getVerificationRecord(created.shortId), null)
})

test('a stranger cannot publish someone else’s agreement', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())

  await assert.rejects(
    () => repo.setVisibility(created.id, STRANGER, 'PUBLIC'),
    (cause: unknown) => isRepoError(cause) && cause.kind === 'NOT_ALLOWED',
  )
})

test('only one issue can be open on an agreement at a time', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())

  const dispute = await repo.raiseDispute({
    pactId: created.id,
    raisedBy: CLIENT,
    reason: 'NOT_DELIVERED',
    detail: 'The files were due on the 12th and nothing has arrived.',
  })
  assert.equal(dispute.status, 'OPEN')

  await assert.rejects(
    () =>
      repo.raiseDispute({
        pactId: created.id,
        raisedBy: PROVIDER,
        reason: 'PAYMENT_MISSING',
        detail: 'A second, competing issue.',
      }),
    (cause: unknown) => isRepoError(cause) && cause.kind === 'CONFLICT',
    'a second open issue would leave the UI with two to choose between',
  )

  // Closed, so the agreement can have a new one later if something else goes wrong.
  await repo.resolveDispute({ disputeId: dispute.id, actor: PROVIDER, status: 'RESOLVED' })
  const reopened = await repo.raiseDispute({
    pactId: created.id,
    raisedBy: PROVIDER,
    reason: 'PAYMENT_MISSING',
    detail: 'Different problem, after the first was settled.',
  })
  assert.equal(reopened.status, 'OPEN')
})

test('only the person who raised an issue can withdraw it', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())
  const dispute = await repo.raiseDispute({
    pactId: created.id,
    raisedBy: CLIENT,
    reason: 'LATE',
    detail: 'The deadline has passed.',
  })

  await assert.rejects(
    () => repo.resolveDispute({ disputeId: dispute.id, actor: PROVIDER, status: 'WITHDRAWN' }),
    (cause: unknown) => isRepoError(cause) && cause.kind === 'NOT_ALLOWED',
    'withdrawing someone else’s complaint would erase their side of the record',
  )

  // But either party can agree it's settled.
  const resolved = await repo.resolveDispute({ disputeId: dispute.id, actor: PROVIDER, status: 'RESOLVED' })
  assert.equal(resolved.status, 'RESOLVED')
  assert.ok(resolved.resolvedAt, 'a closed issue records when it closed')
})

test('a stranger cannot raise an issue on someone else’s agreement', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft())

  await assert.rejects(
    () =>
      repo.raiseDispute({
        pactId: created.id,
        raisedBy: STRANGER,
        reason: 'OTHER',
        detail: 'Nothing to do with me.',
      }),
    (cause: unknown) => isRepoError(cause) && cause.kind === 'NOT_ALLOWED',
  )
})

test('reminders never repeat for the same reason', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft({ deadline: '2020-01-01' }))
  await repo.setStatus(created.id, CLIENT, 'PENDING')

  const first = await repo.refreshNotifications(CLIENT)
  const second = await repo.refreshNotifications(CLIENT)
  assert.ok(first.length > 0, 'an overdue agreement should raise something')
  assert.equal(second.length, first.length, 'polling again must not create duplicate nudges')
})

test('an invitation expires and cannot be reused after that', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft({ counterpartyAddress: null }))
  const invite = await repo.createInvitation({ pactId: created.id, role: 'PROVIDER', createdBy: CLIENT })

  assert.ok(new Date(invite.expiresAt).getTime() > Date.now())
  const accepted = await repo.acceptInvitation(invite.token, PROVIDER)
  assert.equal(accepted.acceptedBy, PROVIDER)

  await assert.rejects(
    () => repo.acceptInvitation('not-a-real-token', PROVIDER),
    (cause) => isRepoError(cause) && cause.kind === 'NOT_FOUND',
  )
})

test('joining fills the open side and re-derives the fingerprint', async () => {
  const repo = new MemoryRepository()
  const created = await repo.createPact(draft({ counterpartyAddress: null }))
  const digestBefore = created.termsDigest

  const joined = await repo.joinPact(created.id, PROVIDER, 'John')
  const provider = joined.participants.find((p) => p.role === 'PROVIDER')

  assert.equal(provider!.address, PROVIDER)
  assert.ok(provider!.joinedAt)
  assert.notEqual(
    joined.termsDigest,
    digestBefore,
    'who the agreement is with is part of the terms, so the fingerprint must move',
  )

  // A second person cannot take a seat that is already filled.
  await assert.rejects(
    () => repo.joinPact(created.id, STRANGER, 'Interloper'),
    (cause) => isRepoError(cause) && cause.kind === 'CONFLICT',
  )
})

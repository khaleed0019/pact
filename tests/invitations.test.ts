import test from 'node:test'
import assert from 'node:assert/strict'
import { MemoryRepository } from '../lib/db/memory.ts'
import { isRepoError } from '../lib/db/repo.ts'
import { MemoryCampaignStore } from '../lib/campaigns/memory.ts'
import {
  acceptInvitation,
  canViewCampaign,
  claimCampaign,
  declineInvitation,
  inviteToCampaign,
  revokeInvitation,
  termsFromCampaign,
} from '../lib/campaigns/service.ts'
import { contributorDashboard } from '../lib/campaigns/dashboard.ts'
import { handleProblem, normalizeHandle } from '../lib/pact/handles.ts'
import { createCampaignSchema } from '../lib/api/schema.ts'
import { normalizeAddress, publicKeyToAddress } from '../lib/nimiq/address.ts'

/**
 * Public vs private campaigns and direct invitations.
 *
 * The properties that matter: a private campaign is invisible and unclaimable to anyone
 * not invited; an invitation is bound to one address and only that wallet can answer it;
 * answering it signs nothing — it creates the ordinary pact, which both sides still sign.
 */

// Real, checksum-valid addresses: invitations validate them exactly as the server does.
const addr = (seed: number) => normalizeAddress(publicKeyToAddress(new Uint8Array(32).fill(seed)))
const BRAND = addr(1)
const ALICE = addr(2)
const BOB = addr(3)
const TODAY = '2026-10-22'

const code = (kind: string) => (e: unknown) => isRepoError(e) && e.kind === kind

async function setup() {
  const repo = new MemoryRepository()
  const store = new MemoryCampaignStore(async (id) => (await repo.getPactById(id))?.status ?? null)
  await repo.setRole(BRAND, 'BRAND')
  await repo.setRole(ALICE, 'CONTRIBUTOR')
  await repo.setRole(BOB, 'CONTRIBUTOR')
  await repo.updateProfileDetails(ALICE, { handle: 'alice_clips' })
  const make = (over: Record<string, unknown> = {}) =>
    store.createCampaign({
      ownerAddress: BRAND,
      ownerName: 'Acme',
      title: 'Cut three clips',
      brief: 'Three vertical clips from our stream.',
      requirements: ['9:16', 'Captions'],
      currency: 'NIM',
      chain: null,
      rewardMinor: '2500000',
      slots: 2,
      deadline: null,
      visibility: 'PRIVATE',
      category: 'VIDEO',
      submissionInstructions: 'Share a Drive folder link',
      platform: 'TikTok',
      revisionLimit: 2,
      ...over,
    } as Parameters<typeof store.createCampaign>[0])
  return { repo, store, make }
}

test('a private campaign is never listed and is invisible to anyone not invited', async () => {
  const { store, make } = await setup()
  const c = await make()
  assert.equal((await store.listOpen(50)).some((x) => x.id === c.id), false, 'not in the marketplace')
  assert.equal(await canViewCampaign(store, c, null), false, 'not to a guest')
  assert.equal(await canViewCampaign(store, c, BOB), false, 'not to an uninvited contributor')
  assert.equal(await canViewCampaign(store, c, BRAND), true, 'the owner sees it')
})

test('an uninvited contributor cannot take a private campaign up, even by id', async () => {
  const { repo, store, make } = await setup()
  const c = await make()
  await assert.rejects(
    claimCampaign(repo, store, { campaignId: c.id, jobberAddress: BOB, jobberName: 'Bob', today: TODAY }),
    code('NOT_FOUND'),
  )
})

test('an invitation by handle is bound to the address that owns the handle', async () => {
  const { repo, store, make } = await setup()
  const c = await make()
  const invitation = await inviteToCampaign(repo, store, { campaignId: c.id, actor: BRAND, target: { handle: '@Alice_Clips' } })
  assert.equal(invitation.inviteeAddress, ALICE)
  assert.equal(invitation.via, 'HANDLE')
  assert.equal(await canViewCampaign(store, c, ALICE), true)
  await assert.rejects(
    inviteToCampaign(repo, store, { campaignId: c.id, actor: BRAND, target: { handle: 'nobody_here' } }),
    code('NOT_FOUND'),
  )
})

test('only the owner can invite, nobody can invite themselves, and repeats do not duplicate', async () => {
  const { repo, store, make } = await setup()
  const c = await make()
  await assert.rejects(inviteToCampaign(repo, store, { campaignId: c.id, actor: BOB, target: { address: ALICE } }), code('NOT_FOUND'))
  await assert.rejects(inviteToCampaign(repo, store, { campaignId: c.id, actor: BRAND, target: { address: BRAND } }), code('INVALID'))
  const a = await inviteToCampaign(repo, store, { campaignId: c.id, actor: BRAND, target: { address: ALICE } })
  const b = await inviteToCampaign(repo, store, { campaignId: c.id, actor: BRAND, target: { handle: 'alice_clips' } })
  assert.equal(a.id, b.id)
  assert.equal((await store.listInvitationsForCampaign(c.id)).length, 1)
})

test('someone else cannot accept or decline an invitation sent to a different wallet', async () => {
  const { repo, store, make } = await setup()
  const c = await make()
  const invitation = await inviteToCampaign(repo, store, { campaignId: c.id, actor: BRAND, target: { address: ALICE } })
  await assert.rejects(
    acceptInvitation(repo, store, { invitationId: invitation.id, actor: BOB, name: 'Bob', today: TODAY }),
    code('NOT_FOUND'),
  )
  await assert.rejects(declineInvitation(store, { invitationId: invitation.id, actor: BOB }), code('NOT_FOUND'))
  assert.equal((await store.getInvitation(invitation.id))!.status, 'PENDING')
})

test('accepting creates the ordinary pact, unsigned, carrying the brief’s working terms', async () => {
  const { repo, store, make } = await setup()
  const c = await make()
  const invitation = await inviteToCampaign(repo, store, { campaignId: c.id, actor: BRAND, target: { address: ALICE } })
  const { pact, invitation: accepted } = await acceptInvitation(repo, store, {
    invitationId: invitation.id,
    actor: ALICE,
    name: 'Alice',
    today: TODAY,
  })
  assert.equal(accepted.status, 'ACCEPTED')
  assert.equal(accepted.pactId, pact.id)
  assert.ok(pact.participants.every((p) => p.sealSignature === null), 'accepting signs nothing')
  assert.equal(pact.status, 'PENDING')
  assert.ok(pact.specialTerms.includes('Platform: TikTok'))
  assert.ok(pact.specialTerms.includes('How to submit: Share a Drive folder link'))
  assert.ok(pact.specialTerms.includes('Up to 2 revision rounds included.'))

  await assert.rejects(
    acceptInvitation(repo, store, { invitationId: invitation.id, actor: ALICE, name: 'Alice', today: TODAY }),
    code('CONFLICT'),
    'accepting twice does not create a second agreement',
  )
  assert.equal((await store.listClaims(c.id)).length, 1)
})

test('two simultaneous accepts create exactly one agreement', async () => {
  const { repo, store, make } = await setup()
  const c = await make()
  const invitation = await inviteToCampaign(repo, store, { campaignId: c.id, actor: BRAND, target: { address: ALICE } })
  const results = await Promise.allSettled([
    acceptInvitation(repo, store, { invitationId: invitation.id, actor: ALICE, name: 'A', today: TODAY }),
    acceptInvitation(repo, store, { invitationId: invitation.id, actor: ALICE, name: 'A', today: TODAY }),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal((await store.listClaims(c.id)).length, 1)
})

test('a failed accept puts the invitation back so it can be tried again', async () => {
  const { repo, store, make } = await setup()
  const c = await make({ slots: 1 })
  await store.setStatus(c.id, 'PAUSED')
  const invitation = await inviteToCampaign(repo, store, { campaignId: c.id, actor: BRAND, target: { address: ALICE } })
  await assert.rejects(acceptInvitation(repo, store, { invitationId: invitation.id, actor: ALICE, name: 'A', today: TODAY }))
  assert.equal((await store.getInvitation(invitation.id))!.status, 'PENDING')
})

test('declined and revoked invitations are final, and a revoked one stops granting access', async () => {
  const { repo, store, make } = await setup()
  const c = await make()
  const toAlice = await inviteToCampaign(repo, store, { campaignId: c.id, actor: BRAND, target: { address: ALICE } })
  await declineInvitation(store, { invitationId: toAlice.id, actor: ALICE })
  await assert.rejects(
    acceptInvitation(repo, store, { invitationId: toAlice.id, actor: ALICE, name: 'A', today: TODAY }),
    code('CONFLICT'),
  )

  const toBob = await inviteToCampaign(repo, store, { campaignId: c.id, actor: BRAND, target: { address: BOB } })
  await assert.rejects(revokeInvitation(store, { invitationId: toBob.id, actor: ALICE }), code('NOT_FOUND'), 'only the owner revokes')
  await revokeInvitation(store, { invitationId: toBob.id, actor: BRAND })
  assert.equal(await canViewCampaign(store, c, BOB), false)
})

test('pending invitations reach the contributor dashboard; public campaigns still list', async () => {
  const { repo, store, make } = await setup()
  const pub = await make({ visibility: 'PUBLIC', title: 'Public one' })
  assert.ok((await store.listOpen(50)).some((x) => x.id === pub.id))
  const priv = await make()
  await inviteToCampaign(repo, store, { campaignId: priv.id, actor: BRAND, target: { address: ALICE } })
  assert.equal((await store.listInvitationsForInvitee(ALICE)).filter((i) => i.status === 'PENDING').length, 1)
  assert.equal((await contributorDashboard(repo, store, ALICE)).openOpportunities, 1, 'private campaigns are not counted as open')
})

test('handles: normalized, validated, reserved names refused, unique per wallet', async () => {
  assert.equal(normalizeHandle('  @Clip_King '), 'clip_king')
  assert.equal(handleProblem('ab'), 'FORMAT')
  assert.equal(handleProblem('9lives'), 'FORMAT')
  assert.equal(handleProblem('has space'), 'FORMAT')
  assert.equal(handleProblem('admin'), 'RESERVED')
  assert.equal(handleProblem('pact_team'), 'RESERVED')
  assert.equal(handleProblem('clip_king'), null)

  const { repo } = await setup()
  await assert.rejects(repo.updateProfileDetails(BOB, { handle: 'alice_clips' }), code('CONFLICT'))
  await repo.updateProfileDetails(ALICE, { handle: 'alice_new' })
  assert.equal((await repo.findProfileByHandle('alice_clips')), null, 'the old handle is released')
  assert.equal((await repo.findProfileByHandle('alice_new'))?.address, ALICE)
})

test('a private campaign must name someone to invite; terms stay within pact limits', async () => {
  const base = {
    ownerName: 'A', title: 'T', brief: 'B', requirements: [], currency: 'NIM', chain: null,
    rewardMinor: '1', slots: 1, deadline: null,
  }
  assert.throws(() => createCampaignSchema.parse({ ...base, visibility: 'PRIVATE', invite: [] }))
  assert.doesNotThrow(() => createCampaignSchema.parse({ ...base, visibility: 'PRIVATE', invite: [{ handle: 'alice_clips' }] }))

  assert.throws(() => createCampaignSchema.parse({ ...base, submissionInstructions: 'S'.repeat(281) }))
  const { make } = await setup()
  const c = await make({ submissionInstructions: 'S'.repeat(280), platform: 'P'.repeat(40) })
  const terms = termsFromCampaign(c)
  assert.ok(terms.specialTerms.every((t) => t.length <= 300), 'each special term fits the pact’s 300 limit')
})

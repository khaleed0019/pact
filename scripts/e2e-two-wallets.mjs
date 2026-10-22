#!/usr/bin/env node
/**
 * Two-identity end-to-end run against a running PACT server.
 *
 *   node scripts/e2e-two-wallets.mjs http://localhost:3100
 *
 * WHAT THIS IS: two freshly generated Ed25519 keys (a "brand" and a "contributor") going
 * through PACT's real HTTP routes — the real sign-in challenge, real signature
 * verification, real role gate, real campaign claim, real seals over the real terms
 * digest, delivery, a revision round, approval, and a payment report that the server
 * checks against the real Nimiq network.
 *
 * WHAT THIS IS NOT: a Nimiq Pay run. There is no wallet UI, no host app, and no money. The
 * "transaction" reported is a made-up hash, so the correct outcome is that the server
 * refuses to confirm it — which is exactly what this checks. A real payment still has to
 * be made from Nimiq Pay with two real wallets; this script cannot stand in for that.
 *
 * Run it against a server on the in-process store (SUPABASE_URL unset), never production.
 */
import { ed25519 } from '@noble/curves/ed25519'
import { randomBytes } from 'node:crypto'

const BASE = process.argv[2] ?? 'http://localhost:3100'
const hex = (b) => Buffer.from(b).toString('hex')
const results = []
let failed = 0

function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

function identity(label) {
  const secret = randomBytes(32)
  const publicKey = ed25519.getPublicKey(secret)
  let cookie = ''
  const call = async (path, method = 'GET', body) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const pair = c.split(';')[0]
      const name = pair.split('=')[0]
      cookie = [...cookie.split('; ').filter((x) => x && !x.startsWith(name + '=')), pair].join('; ')
    }
    let json = null
    try {
      json = await res.json()
    } catch {}
    return { status: res.status, body: json }
  }
  const sign = (message) => ({
    publicKey: hex(publicKey),
    signature: hex(ed25519.sign(new TextEncoder().encode(message), secret)),
  })
  const signIn = async () => {
    const challenge = await call('/api/auth/nonce', 'POST')
    const signed = sign(challenge.body.message)
    return call('/api/auth/verify', 'POST', { ...signed, nonce: challenge.body.nonce })
  }
  return { label, call, sign, signIn }
}

const brand = identity('brand')
const worker = identity('contributor')
const stranger = identity('stranger')

// --- sign in and choose roles ------------------------------------------------------
const b = await brand.signIn()
check('brand signs in with a wallet signature', b.status === 200, b.body?.address)
const w = await worker.signIn()
check('contributor signs in with a wallet signature', w.status === 200, w.body?.address)
await stranger.signIn()

check('a new wallet has no role yet', (await brand.call('/api/me')).body?.role === null)
check('choosing a role is saved', (await brand.call('/api/me/role', 'PATCH', { role: 'BRAND' })).status === 200)
await worker.call('/api/me/role', 'PATCH', { role: 'CONTRIBUTOR' })
check('the role is restored on the next visit', (await brand.call('/api/me')).body?.role === 'BRAND')

// --- handles, private campaigns and invitations ---------------------------------------
await stranger.call('/api/me/role', 'PATCH', { role: 'CONTRIBUTOR' })
const handle = `e2e_${randomBytes(3).toString('hex')}`
const setHandle = await worker.call('/api/me/profile', 'PATCH', { handle: `@${handle.toUpperCase()}` })
check('the contributor sets a handle (normalized)', setHandle.body?.profile?.handle === handle, setHandle.body?.error?.detail)
check('a reserved handle is refused', (await stranger.call('/api/me/profile', 'PATCH', { handle: 'admin' })).status === 422)
check('someone else cannot take the same handle', (await stranger.call('/api/me/profile', 'PATCH', { handle })).status === 409)
const found = await brand.call(`/api/profiles?q=${handle.slice(0, 6)}`)
check('the brand finds the contributor by handle', found.body?.profiles?.some((p) => p.handle === handle))

const privateInput = {
  ownerName: 'E2E Brand',
  title: 'E2E: private clip edit',
  brief: 'Edit one clip, for one invited person.',
  requirements: ['Vertical'],
  currency: 'NIM',
  chain: null,
  rewardMinor: '100000',
  slots: 1,
  deadline: null,
  visibility: 'PRIVATE',
  category: 'VIDEO',
  platform: 'TikTok',
  submissionInstructions: 'Share a folder link',
  revisionLimit: 1,
  invite: [{ handle }],
}
check('a private campaign without anyone to invite is refused', (await brand.call('/api/campaigns', 'POST', { ...privateInput, invite: [] })).status === 422)
check('an invite to an unknown handle is refused before anything is created', (await brand.call('/api/campaigns', 'POST', { ...privateInput, invite: [{ handle: 'nobody_e2e_x' }] })).status === 404)
const priv = await brand.call('/api/campaigns', 'POST', privateInput)
check('the brand posts an invite-only campaign', priv.status === 201 && priv.body?.invitations?.length === 1, priv.body?.error?.detail)
const privId = priv.body.campaign.id
check('it is not in the public marketplace', !(await stranger.call('/api/campaigns')).body.open.some((c) => c.campaign.id === privId))
check('an uninvited person gets 404 for its page', (await stranger.call(`/api/campaigns/${privId}`)).status === 404)
check('a guest gets 404 too', (await fetch(`${BASE}/api/campaigns/${privId}`)).status === 404)
check('an uninvited person cannot take it up by id', (await stranger.call(`/api/campaigns/${privId}/claim`, 'POST', { name: 'S' })).status === 404)
const mine = await worker.call('/api/campaigns')
const invite = mine.body?.invitations?.find((i) => i.campaign.id === privId)?.invitation
check('the invitation reaches the contributor', !!invite)
const view = await worker.call(`/api/campaigns/${privId}`)
check('the invitee can open the campaign', view.status === 200 && view.body?.myInvitation?.status === 'PENDING')
check('someone else cannot accept it', (await stranger.call(`/api/invitations/${invite.id}/accept`, 'POST', { name: 'S' })).status === 404)
check('someone else cannot decline it', (await stranger.call(`/api/invitations/${invite.id}/decline`, 'POST')).status === 404)
const accepted = await worker.call(`/api/invitations/${invite.id}/accept`, 'POST', { name: 'E2E Contributor' })
check('the invitee accepts', accepted.status === 201, accepted.body?.error?.detail)
check('accepting twice is refused', (await worker.call(`/api/invitations/${invite.id}/accept`, 'POST', { name: 'x' })).status === 409)
const invPact = (await worker.call(`/api/pacts/${accepted.body.pactId}`)).body?.pact
check('accepting created the agreement, unsigned', invPact?.participants?.every((p) => p.sealSignature === null))
check('the brief’s working terms are in the agreement', invPact?.specialTerms?.includes('Platform: TikTok') && invPact?.specialTerms?.includes('Up to 1 revision round included.'))

const byAddress = await brand.call(`/api/campaigns/${privId}/invitations`, 'POST', { address: 'NQ00 0000 0000 0000 0000 0000 0000 0000 0000' })
check('an invalid wallet address is refused', byAddress.status === 422 || byAddress.status === 400)

// --- brand posts a campaign ----------------------------------------------------------
const campaignInput = {
  ownerName: 'E2E Brand',
  title: 'E2E: write a short review',
  brief: 'Write a short honest review of the app.',
  requirements: ['At least 50 words', 'One screenshot link'],
  currency: 'NIM',
  chain: null,
  rewardMinor: '100000',
  slots: 1,
  deadline: null,
}
check('a contributor cannot post a campaign', (await worker.call('/api/campaigns', 'POST', campaignInput)).status === 403)
const created = await brand.call('/api/campaigns', 'POST', campaignInput)
check('the brand posts a campaign', created.status === 201)
const campaignId = created.body.campaign.id

// --- contributor takes it up -----------------------------------------------------------
check('a brand cannot take work up', (await brand.call(`/api/campaigns/${campaignId}/claim`, 'POST', { name: 'Brand' })).status === 403)
const claim = await worker.call(`/api/campaigns/${campaignId}/claim`, 'POST', { name: 'E2E Contributor' })
check('the contributor takes the campaign up', claim.status === 201)
const pactId = claim.body.pactId
check('taking it up twice is refused', (await worker.call(`/api/campaigns/${campaignId}/claim`, 'POST', { name: 'x' })).status === 409)
check('a stranger cannot read the agreement', (await stranger.call(`/api/pacts/${pactId}`)).status === 403)

// --- both sign the exact terms ---------------------------------------------------------
for (const who of [worker, brand]) {
  const { body } = await who.call(`/api/pacts/${pactId}/seal`)
  const res = await who.call(`/api/pacts/${pactId}/seal`, 'POST', who.sign(body.message))
  check(`${who.label} seals the terms`, res.status === 200, res.body?.error?.detail)
}
let pact = (await brand.call(`/api/pacts/${pactId}`)).body.pact
check('both signatures make the agreement ACTIVE', pact.status === 'ACTIVE', pact.status)
const replay = await stranger.call(`/api/pacts/${pactId}/seal`, 'POST', worker.sign('anything'))
check('a stranger cannot seal it', replay.status === 403)

// --- work, a revision, approval --------------------------------------------------------
const d1 = await worker.call(`/api/pacts/${pactId}/deliverables`, 'POST', { note: 'First draft', link: 'https://example.com/draft' })
check('the contributor submits work', d1.status === 200 || d1.status === 201, d1.body?.error?.detail)
const d1id = d1.body?.deliverable?.id
check('the contributor cannot approve their own work', (await worker.call(`/api/deliverables/${d1id}`, 'PATCH', { status: 'APPROVED' })).status === 403)
const rev = await brand.call(`/api/deliverables/${d1id}`, 'PATCH', { status: 'CHANGES_REQUESTED', reviewNote: 'Add the screenshot link' })
check('the brand requests changes with a reason', rev.status === 200, rev.body?.error?.detail)
const d2 = await worker.call(`/api/pacts/${pactId}/deliverables`, 'POST', { note: 'Second draft with screenshot', link: 'https://example.com/v2' })
check('the contributor resubmits', d2.status === 200 || d2.status === 201, d2.body?.error?.detail)
const appr = await brand.call(`/api/deliverables/${d2.body?.deliverable?.id}`, 'PATCH', { status: 'APPROVED' })
check('the brand approves', appr.status === 200, appr.body?.error?.detail)

// --- payment: report a made-up hash and confirm the server refuses to believe it ------
const pay = await brand.call('/api/payments', 'POST', {
  pactId,
  milestoneId: null,
  amountMinor: '100000',
  idempotencyKey: `e2e-${Date.now()}`,
})
check('the brand records a payment attempt', pay.status === 200 || pay.status === 201, pay.body?.error?.detail)
const paymentId = pay.body?.payment?.id
check('the recipient is the contributor, set by the server', pay.body?.payment?.toAddress?.replace(/\s/g, '') === w.body.address.replace(/\s/g, ''))
check('the contributor cannot report the brand’s payment', (await worker.call(`/api/payments/${paymentId}`, 'PATCH', { status: 'SUBMITTED', txReference: 'a'.repeat(64) })).status === 403)
check('nobody can mark a payment CONFIRMED', (await brand.call(`/api/payments/${paymentId}`, 'PATCH', { status: 'CONFIRMED', txReference: 'a'.repeat(64) })).status === 403)
const fakeHash = hex(randomBytes(32))
const sent = await brand.call(`/api/payments/${paymentId}`, 'PATCH', { status: 'SUBMITTED', txReference: fakeHash })
check('the brand reports it sent', sent.status === 200, sent.body?.error?.detail)
check('an invented transaction is NOT confirmed', sent.body?.payment?.status === 'SUBMITTED', `${sent.body?.payment?.status} / ${sent.body?.verification?.state}`)
const recheck = await worker.call(`/api/payments/${paymentId}/verify`, 'POST')
check('either party can re-check; it stays unconfirmed', recheck.body?.payment?.status === 'SUBMITTED', recheck.body?.verification?.reason)
check('a stranger cannot trigger a check', (await stranger.call(`/api/payments/${paymentId}/verify`, 'POST')).status === 403)

// --- both sides see the same, honest state --------------------------------------------
const bd = (await brand.call('/api/dashboard')).body
const wd = (await worker.call('/api/dashboard')).body
check('brand dashboard: verified paid is zero', (bd.verified?.NIM ?? '0') === '0', JSON.stringify(bd.verified))
check('brand dashboard: the payment shows as pending', bd.pending?.NIM === '100000', JSON.stringify(bd.pending))
check('contributor dashboard: earnings are zero, pending is not', (wd.verified?.NIM ?? '0') === '0' && wd.pending?.NIM === '100000')
pact = (await worker.call(`/api/pacts/${pactId}`)).body.pact
check('the contributor sees the same payment state', pact.payments[0]?.status === 'SUBMITTED')

console.log(`\n${results.length - failed} of ${results.length} checks passed`)
process.exit(failed ? 1 : 0)

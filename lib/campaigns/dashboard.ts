import type { Repository } from '../db/repo.ts'
import { normalizeAddress } from '../nimiq/address.ts'
import { isTerminal } from '../pact/state.ts'
import type { Currency, PactDetail } from '../pact/types.ts'
import { countHolding, overviewOf } from './service.ts'
import type { CampaignStore } from './store.ts'

/**
 * Role dashboards, computed from records rather than stored.
 *
 * Every figure here is a count or a sum over rows that already exist — no estimates, no
 * projections, nothing that could drift from the history behind it. Money is summed per
 * currency and never converted: adding NIM to USDT would need a rate PACT does not have.
 *
 * The names are deliberately precise, because they are easy to blur:
 *
 *   potential  reward x every spot           what posting could commit the brand to
 *   agreed     reward x spots taken          what the brand has agreed to pay so far
 *   pending    payments sent, not confirmed  "sent" is not "paid"
 *   verified   CONFIRMED by the network      the only number that means money arrived
 */

export type Amounts = Partial<Record<Currency, string>>

function add(into: Amounts, currency: Currency, minor: string | bigint): void {
  into[currency] = (BigInt(into[currency] ?? '0') + BigInt(minor)).toString()
}

export interface ActionItem {
  pactId: string
  title: string
  label: string
}

export interface BrandDashboard {
  role: 'BRAND'
  liveCampaigns: number
  openSpots: number
  people: number
  potential: Amounts
  agreed: Amounts
  pending: Amounts
  verified: Amounts
  reviewQueue: ActionItem[]
  awaitingSignature: ActionItem[]
}

export interface InvitationItem {
  invitationId: string
  campaignId: string
  title: string
  ownerName: string
  brief: string
  rewardMinor: string
  currency: Currency
  deadline: string | null
  visibility: 'PUBLIC' | 'PRIVATE'
}

export interface ContributorDashboard {
  role: 'CONTRIBUTOR'
  invitations: InvitationItem[]
  openOpportunities: number
  activeWork: number
  nextDeadline: { pactId: string; title: string; deadline: string } | null
  awaitingReview: ActionItem[]
  revisions: ActionItem[]
  approvedUnpaid: ActionItem[]
  pending: Amounts
  verified: Amounts
}

export async function brandDashboard(repo: Repository, store: CampaignStore, address: string): Promise<BrandDashboard> {
  const campaigns = await store.listByOwner(address)
  const out: BrandDashboard = {
    role: 'BRAND',
    liveCampaigns: campaigns.filter((c) => c.status === 'OPEN').length,
    openSpots: 0,
    people: 0,
    potential: {},
    agreed: {},
    pending: {},
    verified: {},
    reviewQueue: [],
    awaitingSignature: [],
  }

  for (const campaign of campaigns) {
    const view = await overviewOf(repo, store, campaign)
    if (campaign.status === 'OPEN') out.openSpots += view.budget.open
    out.people += view.budget.taken
    add(out.potential, campaign.currency, view.budget.ceilingMinor)
    add(out.agreed, campaign.currency, view.budget.committedMinor)
    add(out.verified, campaign.currency, view.budget.paidMinor)

    for (const claim of view.claims) {
      if (!claim.pactId) continue
      const pact = await repo.getPactById(claim.pactId)
      for (const payment of pact?.payments ?? []) {
        if (payment.status === 'SUBMITTED') add(out.pending, payment.currency, payment.amountMinor)
      }
      if (claim.awaitingReview) {
        out.reviewQueue.push({ pactId: claim.pactId, title: campaign.title, label: `${claim.jobberName} submitted work` })
      }
      if (claim.awaitingBrandSignature) {
        out.awaitingSignature.push({ pactId: claim.pactId, title: campaign.title, label: `${claim.jobberName} is waiting for your signature` })
      }
    }
  }
  return out
}

export async function contributorDashboard(
  repo: Repository,
  store: CampaignStore,
  address: string,
): Promise<ContributorDashboard> {
  const me = normalizeAddress(address)
  const [open, claims, pacts, invitationRows] = await Promise.all([
    store.listOpen(200),
    store.listClaimsForJobber(me),
    repo.listPactsForAddress(me),
    store.listInvitationsForInvitee(me),
  ])

  const invitations: InvitationItem[] = []
  for (const invitation of invitationRows.filter((i) => i.status === 'PENDING')) {
    const c = await store.getCampaign(invitation.campaignId)
    if (!c || (c.status !== 'OPEN' && c.status !== 'PAUSED')) continue
    invitations.push({
      invitationId: invitation.id,
      campaignId: c.id,
      title: c.title,
      ownerName: c.ownerName,
      brief: c.brief,
      rewardMinor: c.rewardMinor,
      currency: c.currency,
      deadline: c.deadline,
      visibility: c.visibility,
    })
  }

  const claimedIds = new Set(claims.map((c) => c.campaignId))
  const openRecords = await store.listClaimsForCampaigns(open.map((c) => c.id))
  const today = new Date().toISOString().slice(0, 10)
  const openOpportunities = open.filter(
    (c) =>
      c.ownerAddress !== me &&
      !claimedIds.has(c.id) &&
      (!c.deadline || c.deadline >= today) &&
      countHolding(openRecords.filter((r) => r.campaignId === c.id)) < c.slots,
  ).length

  const out: ContributorDashboard = {
    role: 'CONTRIBUTOR',
    invitations,
    openOpportunities,
    activeWork: 0,
    nextDeadline: null,
    awaitingReview: [],
    revisions: [],
    approvedUnpaid: [],
    pending: {},
    verified: {},
  }

  const details = (await Promise.all(pacts.map((p) => repo.getPactById(p.id)))).filter((p): p is PactDetail => !!p)

  for (const pact of details) {
    const self = pact.participants.find((p) => p.address && normalizeAddress(p.address) === me)
    if (!self || self.role !== 'PROVIDER') continue // earnings and work are the delivering side only

    for (const payment of pact.payments) {
      if (normalizeAddress(payment.toAddress) !== me) continue
      if (payment.status === 'CONFIRMED') add(out.verified, payment.currency, payment.amountMinor)
      if (payment.status === 'SUBMITTED') add(out.pending, payment.currency, payment.amountMinor)
    }

    if (isTerminal(pact.status)) continue
    out.activeWork += 1

    if (pact.deadline && (!out.nextDeadline || pact.deadline < out.nextDeadline.deadline)) {
      out.nextDeadline = { pactId: pact.id, title: pact.title, deadline: pact.deadline }
    }

    const latest = [...pact.deliverables].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const paid = pact.payments.some((p) => p.status === 'CONFIRMED')
    if (latest?.status === 'SUBMITTED') out.awaitingReview.push({ pactId: pact.id, title: pact.title, label: 'Waiting for review' })
    if (latest?.status === 'CHANGES_REQUESTED') {
      out.revisions.push({ pactId: pact.id, title: pact.title, label: latest.reviewNote ? `Changes asked: ${latest.reviewNote}` : 'Changes requested' })
    }
    if (latest?.status === 'APPROVED' && !paid) out.approvedUnpaid.push({ pactId: pact.id, title: pact.title, label: 'Approved — waiting for payment' })
  }

  return out
}

import type { Repository } from '../db/repo.ts'
import { RepoError } from '../db/repo.ts'
import { normalizeAddress } from '../nimiq/address.ts'
import { SLOT_RELEASING, summariseBudget } from './model.ts'
import type { BudgetSummary, Campaign, CampaignClaim } from './model.ts'
import type { CampaignStore, ClaimRecord } from './store.ts'
import type { PactDetail, PactStatus } from '../pact/types.ts'

/**
 * What happens between a campaign and the pacts it produces.
 *
 * Kept free of framework imports so the whole claim flow runs under the test runner
 * against the in-process stores.
 */

/** The agreement's terms, written from the campaign. Fits the pact's own length limits by construction. */
export function termsFromCampaign(campaign: Campaign): { deliverable: string; paymentCondition: string } {
  const lines = [campaign.brief.trim()]
  if (campaign.requirements.length > 0) {
    lines.push('', 'Requirements:', ...campaign.requirements.map((r) => `- ${r}`))
  }
  return {
    deliverable: lines.join('\n'),
    paymentCondition: 'Paid by the brand directly, after they approve the submitted work.',
  }
}

/**
 * Take a campaign up: reserve a slot, then create the ordinary two-party PACT for it.
 *
 * The jobber is the creator and the brand is the counterparty, so nothing here speaks for
 * the brand beyond what it already published in the campaign — and the agreement is not in
 * force until both have signed it, like any other. If the pact cannot be created the slot
 * is given back, so a failure never leaves someone holding a spot with nothing behind it.
 */
export async function claimCampaign(
  repo: Repository,
  store: CampaignStore,
  input: { campaignId: string; jobberAddress: string; jobberName: string; today: string },
): Promise<{ claim: CampaignClaim; pact: PactDetail }> {
  const campaign = await store.getCampaign(input.campaignId)
  if (!campaign) throw new RepoError('NOT_FOUND', 'That campaign does not exist.')

  const claim = await store.reserveSlot(campaign.id, input.jobberAddress, input.today)

  let pact: PactDetail
  try {
    const terms = termsFromCampaign(campaign)
    pact = await repo.createPact({
      createdBy: input.jobberAddress,
      category: 'FREELANCE',
      creatorRole: 'PROVIDER',
      creatorName: input.jobberName,
      counterpartyName: campaign.ownerName,
      counterpartyAddress: campaign.ownerAddress,
      title: campaign.title,
      deliverable: terms.deliverable,
      currency: campaign.currency,
      chain: campaign.chain,
      totalAmountMinor: campaign.rewardMinor,
      deadline: campaign.deadline,
      paymentCondition: terms.paymentCondition,
      specialTerms: [],
      milestones: [],
    })
    // Taking the campaign up is the jobber offering these terms, so the agreement goes
    // straight to the brand for its signature rather than waiting as a draft.
    pact = await repo.setStatus(pact.id, input.jobberAddress, 'PENDING')
    const attached = await store.attachPact(claim.id, pact.id)
    return { claim: attached, pact }
  } catch (cause) {
    await store.releaseClaim(claim.id)
    throw cause
  }
}

export interface ClaimOverview {
  claim: ClaimRecord
  pactId: string | null
  pactShortId: string | null
  pactStatus: PactStatus | null
  jobberName: string
  /** Sealed by both sides, i.e. the terms are agreed. */
  sealed: boolean
  /** Waiting on the brand's own signature. */
  awaitingBrandSignature: boolean
  /** Work submitted and not yet reviewed. */
  awaitingReview: boolean
  paidMinor: string
  paymentSubmitted: boolean
}

export interface CampaignOverview {
  campaign: Campaign
  budget: BudgetSummary
  claims: ClaimOverview[]
}

/** The brand's view: who took it up, where each agreement stands, and what has really been paid. */
export async function overviewOf(repo: Repository, store: CampaignStore, campaign: Campaign): Promise<CampaignOverview> {
  const records = await store.listClaims(campaign.id)
  const holding = records.filter((r) => !r.pactStatus || !SLOT_RELEASING.includes(r.pactStatus))

  const claims: ClaimOverview[] = []
  let paid = 0n
  for (const claim of holding) {
    const pact = claim.pactId ? await repo.getPactById(claim.pactId) : null
    const confirmed = (pact?.payments ?? []).filter((p) => p.status === 'CONFIRMED')
    paid += confirmed.reduce((sum, p) => sum + BigInt(p.amountMinor), 0n)

    const brand = pact?.participants.find((p) => normalizeAddress(p.address ?? '') === normalizeAddress(campaign.ownerAddress))
    const provider = pact?.participants.find((p) => p.role === 'PROVIDER')
    const sealed = !!pact && pact.participants.length > 0 && pact.participants.every((p) => p.sealSignature)
    claims.push({
      claim,
      pactId: pact?.id ?? null,
      pactShortId: pact?.shortId ?? null,
      pactStatus: pact?.status ?? null,
      jobberName: provider?.displayName ?? 'Someone',
      sealed,
      awaitingBrandSignature: !!pact && !!brand && !brand.sealSignature && !!provider?.sealSignature,
      awaitingReview: !!pact?.deliverables.some((d) => d.status === 'SUBMITTED'),
      paidMinor: confirmed.reduce((sum, p) => sum + BigInt(p.amountMinor), 0n).toString(),
      paymentSubmitted: !!pact?.payments.some((p) => p.status === 'SUBMITTED'),
    })
  }

  return { campaign, budget: summariseBudget(campaign, holding.length, paid.toString()), claims }
}

/** How many of these claims still hold a slot. */
export function countHolding(records: ClaimRecord[]): number {
  return records.filter((r) => !r.pactStatus || !SLOT_RELEASING.includes(r.pactStatus)).length
}

/** A campaign with its live numbers, for browsing. No per-person detail. */
export interface CampaignCard {
  campaign: Campaign
  budget: BudgetSummary
}

export async function cardsFor(store: CampaignStore, campaigns: Campaign[]): Promise<CampaignCard[]> {
  const records = await store.listClaimsForCampaigns(campaigns.map((c) => c.id))
  return campaigns.map((campaign) => ({
    campaign,
    // `paid` is the brand's own business until you are the brand; the card shows the offer.
    budget: summariseBudget(campaign, countHolding(records.filter((r) => r.campaignId === campaign.id)), '0'),
  }))
}

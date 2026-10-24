import type { Repository } from '../db/repo.ts'
import { RepoError } from '../db/repo.ts'
import { isValidAddress, normalizeAddress } from '../nimiq/address.ts'
import { handleProblem, normalizeHandle } from '../pact/handles.ts'
import { resolvePartyName } from '../pact/names.ts'
import { SLOT_RELEASING, summariseBudget } from './model.ts'
import type { BudgetSummary, Campaign, CampaignClaim, CampaignInvitation } from './model.ts'
import type { CampaignStore, ClaimRecord, CreateCampaignInput } from './store.ts'
import { ROLE_REQUIRED, roleBlockMessage, type AppRole } from '../pact/roles.ts'
import type { PactDetail, PactStatus } from '../pact/types.ts'

/**
 * What happens between a campaign and the pacts it produces.
 *
 * Kept free of framework imports so the whole claim flow runs under the test runner
 * against the in-process stores.
 */

/**
 * The agreement's terms, written from the campaign. Fits the pact's own length limits by
 * construction: the brief and acceptance criteria go in the deliverable (≤ 2000), and the
 * shorter working terms — where it goes, how to hand it in, how many revision rounds —
 * become special terms, which both sides sign along with everything else.
 */
export function termsFromCampaign(campaign: Campaign): {
  deliverable: string
  paymentCondition: string
  specialTerms: string[]
} {
  const lines = [campaign.brief.trim()]
  if (campaign.requirements.length > 0) {
    lines.push('', 'Requirements:', ...campaign.requirements.map((r) => `- ${r}`))
  }
  const specialTerms: string[] = []
  if (campaign.platform.trim()) specialTerms.push(`Platform: ${campaign.platform.trim()}`)
  if (campaign.submissionInstructions.trim()) specialTerms.push(`How to submit: ${campaign.submissionInstructions.trim()}`)
  if (campaign.revisionLimit !== null) {
    specialTerms.push(
      campaign.revisionLimit === 0
        ? 'No revision rounds are included.'
        : `Up to ${campaign.revisionLimit} revision ${campaign.revisionLimit === 1 ? 'round' : 'rounds'} included.`,
    )
  }
  return {
    deliverable: lines.join('\n'),
    paymentCondition: 'Paid by the brand directly, after they approve the submitted work.',
    specialTerms,
  }
}

/** Refuse unless the stored role for this verified address is `needed`. */
export async function assertRole(repo: Repository, address: string, needed: AppRole): Promise<void> {
  if ((await repo.getRole(address)) !== needed) throw new RepoError('NOT_ALLOWED', roleBlockMessage(needed))
}

/**
 * Whether `address` may see this campaign at all.
 *
 * Public: anyone. Private: the owner, anyone invited (an invitation that was revoked no
 * longer counts), and anyone already working on it. Everyone else gets NOT_FOUND from the
 * routes — the same answer as a campaign that does not exist, so a private campaign's
 * existence is not leaked by its id.
 */
export async function canViewCampaign(store: CampaignStore, campaign: Campaign, address: string | null): Promise<boolean> {
  if (campaign.visibility === 'PUBLIC') return true
  if (!address) return false
  const me = normalizeAddress(address)
  if (me === campaign.ownerAddress) return true
  const invitation = await store.findInvitation(campaign.id, me)
  if (invitation && invitation.status !== 'REVOKED') return true
  return (await store.listClaims(campaign.id)).some((c) => c.jobberAddress === me)
}

/** Post a campaign. Brands only — checked against storage, not the request. */
export async function postCampaign(repo: Repository, store: CampaignStore, input: CreateCampaignInput): Promise<Campaign> {
  await assertRole(repo, input.ownerAddress, ROLE_REQUIRED.postCampaign)
  const ownerName = resolvePartyName(input.ownerName, (await repo.getTrustMetrics(input.ownerAddress)).displayName, input.ownerAddress)
  return store.createCampaign({ ...input, ownerName })
}

export type InviteTarget = { handle: string } | { address: string }

/**
 * Invite one person to a campaign. Owner only.
 *
 * A handle is resolved to the address that set it, here, at send time; an address must be
 * a valid Nimiq address. Either way the invitation is bound to that address, so only that
 * wallet — signed in — can see or accept it. Sending twice returns the same invitation.
 */
export async function inviteToCampaign(
  repo: Repository,
  store: CampaignStore,
  input: { campaignId: string; actor: string; target: InviteTarget },
): Promise<CampaignInvitation> {
  const campaign = await store.getCampaign(input.campaignId)
  if (!campaign || normalizeAddress(input.actor) !== campaign.ownerAddress) {
    throw new RepoError('NOT_FOUND', 'That campaign does not exist.')
  }
  if (campaign.status === 'CLOSED' || campaign.status === 'CANCELLED') {
    throw new RepoError('CONFLICT', 'This campaign has ended, so it can’t take new invitations.')
  }

  const { invitee, via } = await resolveInvitee(repo, input.target, campaign.ownerAddress)
  return store.createInvitation({ campaignId: campaign.id, inviteeAddress: invitee, invitedBy: campaign.ownerAddress, via })
}

/**
 * Turn a handle or address into the address the invitation will be bound to, or throw a
 * RepoError saying why not. Exported so a route can check every target before it creates
 * anything.
 */
export async function resolveInvitee(
  repo: Repository,
  target: InviteTarget,
  ownerAddress: string,
): Promise<{ invitee: string; via: 'HANDLE' | 'ADDRESS' }> {
  let invitee: string
  let via: 'HANDLE' | 'ADDRESS'
  if ('handle' in target) {
    const handle = normalizeHandle(target.handle)
    if (handleProblem(handle) === 'FORMAT') throw new RepoError('INVALID', `@${handle} isn’t a valid handle.`)
    const profile = await repo.findProfileByHandle(handle)
    if (!profile) throw new RepoError('NOT_FOUND', `No one on PACT uses @${handle}.`)
    invitee = profile.address
    via = 'HANDLE'
  } else {
    if (!isValidAddress(target.address)) throw new RepoError('INVALID', 'That is not a valid Nimiq address.')
    invitee = normalizeAddress(target.address)
    via = 'ADDRESS'
  }
  if (invitee === normalizeAddress(ownerAddress)) throw new RepoError('INVALID', 'You can’t invite yourself.')
  return { invitee, via }
}

/** Load an invitation for its invitee. Anyone else gets NOT_FOUND, never a hint it exists. */
async function invitationFor(store: CampaignStore, invitationId: string, actor: string): Promise<CampaignInvitation> {
  const invitation = await store.getInvitation(invitationId)
  if (!invitation || invitation.inviteeAddress !== normalizeAddress(actor)) {
    throw new RepoError('NOT_FOUND', 'That invitation does not exist.')
  }
  return invitation
}

/**
 * Accept an invitation: this is the claim. It reserves a spot and creates the ordinary
 * pact, which the contributor and the brand then both sign — accepting signs nothing.
 *
 * The invitation is moved PENDING → ACCEPTED first (compare-and-set), so a double tap
 * creates one agreement. If the claim then fails, it goes back to PENDING.
 */
export async function acceptInvitation(
  repo: Repository,
  store: CampaignStore,
  input: { invitationId: string; actor: string; name: string; today: string },
): Promise<{ invitation: CampaignInvitation; pact: PactDetail }> {
  const invitation = await invitationFor(store, input.invitationId, input.actor)
  if (invitation.status !== 'PENDING') {
    throw new RepoError('CONFLICT', `This invitation was already ${invitation.status.toLowerCase()}.`)
  }
  await assertRole(repo, input.actor, ROLE_REQUIRED.claimCampaign)

  const taken = await store.setInvitationStatus(invitation.id, 'PENDING', 'ACCEPTED')
  if (!taken) throw new RepoError('CONFLICT', 'This invitation changed while you were answering it.')

  try {
    const { pact } = await claimCampaign(repo, store, {
      campaignId: invitation.campaignId,
      jobberAddress: input.actor,
      jobberName: input.name,
      today: input.today,
    })
    const linked = (await store.setInvitationStatus(invitation.id, 'ACCEPTED', 'ACCEPTED', pact.id)) ?? taken
    return { invitation: linked, pact }
  } catch (cause) {
    await store.setInvitationStatus(invitation.id, 'ACCEPTED', 'PENDING')
    throw cause
  }
}

export async function declineInvitation(
  store: CampaignStore,
  input: { invitationId: string; actor: string },
): Promise<CampaignInvitation> {
  const invitation = await invitationFor(store, input.invitationId, input.actor)
  const next = await store.setInvitationStatus(invitation.id, 'PENDING', 'DECLINED')
  if (!next) throw new RepoError('CONFLICT', `This invitation was already ${invitation.status.toLowerCase()}.`)
  return next
}

/** Withdraw an invitation that has not been answered. Owner only. */
export async function revokeInvitation(
  store: CampaignStore,
  input: { invitationId: string; actor: string },
): Promise<CampaignInvitation> {
  const invitation = await store.getInvitation(input.invitationId)
  const campaign = invitation ? await store.getCampaign(invitation.campaignId) : null
  if (!invitation || !campaign || campaign.ownerAddress !== normalizeAddress(input.actor)) {
    throw new RepoError('NOT_FOUND', 'That invitation does not exist.')
  }
  const next = await store.setInvitationStatus(invitation.id, 'PENDING', 'REVOKED')
  if (!next) throw new RepoError('CONFLICT', `This invitation was already ${invitation.status.toLowerCase()}.`)
  return next
}

/**
 * Take a campaign up: reserve a slot, then create the ordinary two-party PACT for it.
 *
 * The jobber is the creator and the brand is the counterparty, so nothing here speaks for
 * the brand beyond what it already published in the campaign — and the agreement is not in
 * force until both have signed it, like any other. If the pact cannot be created the slot
 * is given back, so a failure never leaves someone holding a spot with nothing behind it.
 *
 * A private campaign can only be taken up by an address with an invitation; to anyone
 * else it does not exist.
 */
export async function claimCampaign(
  repo: Repository,
  store: CampaignStore,
  input: { campaignId: string; jobberAddress: string; jobberName: string; today: string },
): Promise<{ claim: CampaignClaim; pact: PactDetail }> {
  await assertRole(repo, input.jobberAddress, ROLE_REQUIRED.claimCampaign)
  const campaign = await store.getCampaign(input.campaignId)
  if (!campaign) throw new RepoError('NOT_FOUND', 'That campaign does not exist.')

  if (campaign.visibility === 'PRIVATE') {
    const invitation = await store.findInvitation(campaign.id, input.jobberAddress)
    // ACCEPTED here means "being accepted right now" by acceptInvitation, which set it first.
    if (!invitation || invitation.status !== 'ACCEPTED' || invitation.pactId) {
      throw new RepoError('NOT_FOUND', 'That campaign does not exist.')
    }
  }

  const claim = await store.reserveSlot(campaign.id, input.jobberAddress, input.today)
  // Never store a pronoun as a party's name: the brand would read "You" as the contributor.
  const jobberName = resolvePartyName(input.jobberName, (await repo.getTrustMetrics(input.jobberAddress)).displayName, input.jobberAddress)

  let pact: PactDetail
  try {
    const terms = termsFromCampaign(campaign)
    pact = await repo.createPact({
      createdBy: input.jobberAddress,
      category: 'FREELANCE',
      creatorRole: 'PROVIDER',
      creatorName: jobberName,
      counterpartyName: campaign.ownerName,
      counterpartyAddress: campaign.ownerAddress,
      title: campaign.title,
      deliverable: terms.deliverable,
      currency: campaign.currency,
      chain: campaign.chain,
      totalAmountMinor: campaign.rewardMinor,
      deadline: campaign.deadline,
      paymentCondition: terms.paymentCondition,
      specialTerms: terms.specialTerms,
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
  /** The delivery waiting on the brand, so it can be reviewed from the campaign page. */
  pendingDelivery: { id: string; note: string; link: string | null } | null
  paidMinor: string
  paymentSubmitted: boolean
}

export interface CampaignOverview {
  campaign: Campaign
  budget: BudgetSummary
  claims: ClaimOverview[]
}

function pendingOf(pact: PactDetail | null): ClaimOverview['pendingDelivery'] {
  const d = pact?.deliverables.find((x) => x.status === 'SUBMITTED')
  return d ? { id: d.id, note: d.note, link: d.link } : null
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
      awaitingBrandSignature:
        !!pact && !!brand && !brand.sealSignature && (pact.status === 'PENDING' || pact.status === 'NEGOTIATING'),
      awaitingReview: !!pact?.deliverables.some((d) => d.status === 'SUBMITTED'),
      pendingDelivery: pendingOf(pact),
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

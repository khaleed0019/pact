import type { Currency, EvmChainKey } from '../pact/types.ts'

/**
 * Campaigns: a standing offer of work at a fixed reward.
 *
 * A campaign is not an escrow, a pool or a vault, and nothing in this model can express
 * one. It records what a brand has offered. Each person who takes it up gets their own
 * ordinary PACT (see `claimCampaign`), and from that point the pact is the source of
 * truth for signing, delivery, review and payment.
 *
 * ## The numbers, and what they are allowed to be called
 *
 *   committed  reward x slots already taken      — "the brand has agreed to pay this"
 *   paid       confirmed on the network          — "this has actually been paid"
 *
 * There is intentionally no "funded", "locked", "held" or "reserved". The brand pays each
 * person directly, wallet to wallet, after approving their work.
 */

export const CAMPAIGN_STATUSES = ['OPEN', 'PAUSED', 'CLOSED', 'CANCELLED'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

/**
 * PUBLIC campaigns are listed in the marketplace and anyone eligible can take one up.
 * PRIVATE campaigns are never listed: only the owner, the people they invited and people
 * already working on it can see them, and only an invited address can take one up.
 */
export const CAMPAIGN_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const
export type CampaignVisibility = (typeof CAMPAIGN_VISIBILITIES)[number]

export const CAMPAIGN_CATEGORIES = ['VIDEO', 'DESIGN', 'SOCIAL', 'WRITING', 'OTHER'] as const
export type CampaignCategory = (typeof CAMPAIGN_CATEGORIES)[number]

export const CATEGORY_LABEL: Record<CampaignCategory, string> = {
  VIDEO: 'Video',
  DESIGN: 'Design',
  SOCIAL: 'Social media',
  WRITING: 'Writing',
  OTHER: 'Other',
}

export interface Campaign {
  id: string
  ownerAddress: string
  ownerName: string
  title: string
  brief: string
  /** Acceptance criteria: what the work must include for the brand to approve it. */
  requirements: string[]
  visibility: CampaignVisibility
  category: CampaignCategory
  /** How to hand the work in — e.g. "Share a Drive folder link". Becomes a term of the pact. */
  submissionInstructions: string
  /** Where the work goes out, if anywhere — "TikTok", "X". Becomes a term of the pact. */
  platform: string
  /** Rounds of changes the brand may ask for. Null means the brief does not set a limit. */
  revisionLimit: number | null
  currency: Currency
  chain: EvmChainKey | null
  rewardMinor: string
  slots: number
  deadline: string | null
  status: CampaignStatus
  createdAt: string
  updatedAt: string
}

export interface CampaignClaim {
  id: string
  campaignId: string
  jobberAddress: string
  pactId: string | null
  createdAt: string
}

export const INVITATION_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED'] as const
export type InvitationStatus = (typeof INVITATION_STATUSES)[number]

/**
 * An offer of a campaign to one specific address. It is not an agreement and signs
 * nothing: accepting it runs the ordinary claim, which creates the pact both sides sign.
 */
export interface CampaignInvitation {
  id: string
  campaignId: string
  inviteeAddress: string
  invitedBy: string
  via: 'HANDLE' | 'ADDRESS'
  status: InvitationStatus
  pactId: string | null
  createdAt: string
  updatedAt: string
}

/** PENDING resolves exactly once; ACCEPTED, DECLINED and REVOKED are final. */
export function canInvitationTransition(from: InvitationStatus, to: InvitationStatus): boolean {
  return from === 'PENDING' && to !== 'PENDING'
}

const GRAPH: Record<CampaignStatus, readonly CampaignStatus[]> = {
  OPEN: ['PAUSED', 'CLOSED', 'CANCELLED'],
  PAUSED: ['OPEN', 'CLOSED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
}

export function canCampaignTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return GRAPH[from].includes(to)
}

/** Pact statuses whose slot goes back into the pool. */
export const SLOT_RELEASING: readonly string[] = ['DECLINED', 'CANCELLED']

export type ClaimBlocker = 'NOT_OPEN' | 'EXPIRED' | 'OWN_CAMPAIGN' | 'FULL' | 'ALREADY_CLAIMED'

export const CLAIM_BLOCKER_MESSAGE: Record<ClaimBlocker, string> = {
  NOT_OPEN: 'This campaign isn’t taking new people right now.',
  EXPIRED: 'This campaign’s deadline has passed.',
  OWN_CAMPAIGN: 'You can’t take up your own campaign.',
  FULL: 'Every spot in this campaign is taken.',
  ALREADY_CLAIMED: 'You’ve already taken this one up.',
}

/**
 * Why this person cannot take the campaign up, or null if they can.
 *
 * The database re-checks all of this under a row lock; this is the same rule in the same
 * order so the in-process store and the UI agree with it.
 */
export function claimBlocker(input: {
  campaign: Campaign
  taken: number
  jobber: string | null
  alreadyClaimed: boolean
  today: string
}): ClaimBlocker | null {
  const { campaign, taken, jobber, alreadyClaimed, today } = input
  if (campaign.status !== 'OPEN') return 'NOT_OPEN'
  if (campaign.deadline && campaign.deadline < today) return 'EXPIRED'
  if (jobber && jobber === campaign.ownerAddress) return 'OWN_CAMPAIGN'
  if (alreadyClaimed) return 'ALREADY_CLAIMED'
  if (taken >= campaign.slots) return 'FULL'
  return null
}

export interface BudgetSummary {
  rewardMinor: string
  slots: number
  taken: number
  open: number
  /** reward x taken: what the brand has agreed to pay so far. Not money set aside. */
  committedMinor: string
  /** Sum of payments the network has confirmed against this campaign's agreements. */
  paidMinor: string
  /** reward x slots: the most this campaign could ever commit the brand to. */
  ceilingMinor: string
}

export function summariseBudget(campaign: Campaign, taken: number, paidMinor: string): BudgetSummary {
  const reward = BigInt(campaign.rewardMinor)
  return {
    rewardMinor: campaign.rewardMinor,
    slots: campaign.slots,
    taken,
    open: Math.max(0, campaign.slots - taken),
    committedMinor: (reward * BigInt(taken)).toString(),
    paidMinor,
    ceilingMinor: (reward * BigInt(campaign.slots)).toString(),
  }
}

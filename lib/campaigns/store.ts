import type {
  Campaign,
  CampaignCategory,
  CampaignClaim,
  CampaignInvitation,
  CampaignStatus,
  CampaignVisibility,
  InvitationStatus,
} from './model.ts'
import type { Currency, EvmChainKey } from '../pact/types.ts'

/** A claim plus the status of the agreement made from it, which decides whether it still holds a slot. */
export interface ClaimRecord extends CampaignClaim {
  pactStatus: string | null
}

export interface CreateCampaignInput {
  ownerAddress: string
  ownerName: string
  title: string
  brief: string
  requirements: string[]
  currency: Currency
  chain: EvmChainKey | null
  rewardMinor: string
  slots: number
  deadline: string | null
  visibility: CampaignVisibility
  category: CampaignCategory
  submissionInstructions: string
  platform: string
  revisionLimit: number | null
}

/**
 * Storage for campaigns and claims.
 *
 * Separate from `Repository` because a campaign is not part of any one pact; what ties
 * the two together is `claim.pactId`. Two implementations again — in-process (the
 * reference, pinned by tests) and Supabase — and `reserveSlot` is the one operation that
 * has to be atomic, so it is the one the database does under a row lock.
 */
export interface CampaignStore {
  createCampaign(input: CreateCampaignInput): Promise<Campaign>
  getCampaign(id: string): Promise<Campaign | null>
  /** OPEN **PUBLIC** campaigns, newest first. Private campaigns are never listed. */
  listOpen(limit: number): Promise<Campaign[]>
  listByOwner(address: string): Promise<Campaign[]>
  setStatus(id: string, status: CampaignStatus): Promise<Campaign>

  /**
   * Take one slot for `jobber`, or throw a `RepoError` saying why not.
   * Checks status, deadline, ownership, duplicates and capacity atomically.
   */
  reserveSlot(campaignId: string, jobber: string, today: string): Promise<CampaignClaim>
  attachPact(claimId: string, pactId: string): Promise<CampaignClaim>
  /** Give the slot back; used only when the agreement could not be created. */
  releaseClaim(claimId: string): Promise<void>

  listClaims(campaignId: string): Promise<ClaimRecord[]>
  listClaimsForCampaigns(campaignIds: string[]): Promise<ClaimRecord[]>
  listClaimsForJobber(address: string): Promise<Array<ClaimRecord & { campaign: Campaign }>>
  getClaimByPact(pactId: string): Promise<ClaimRecord | null>

  // --- invitations --------------------------------------------------------------------
  /** One invitation per (campaign, address); a repeat returns the existing row. */
  createInvitation(input: {
    campaignId: string
    inviteeAddress: string
    invitedBy: string
    via: 'HANDLE' | 'ADDRESS'
  }): Promise<CampaignInvitation>
  getInvitation(id: string): Promise<CampaignInvitation | null>
  listInvitationsForCampaign(campaignId: string): Promise<CampaignInvitation[]>
  listInvitationsForInvitee(address: string): Promise<CampaignInvitation[]>
  findInvitation(campaignId: string, address: string): Promise<CampaignInvitation | null>
  /**
   * Compare-and-set: moves the invitation only if it is still `from`. Returns null when it
   * had already changed, so two taps on Accept cannot both win.
   */
  setInvitationStatus(id: string, from: InvitationStatus, to: InvitationStatus, pactId?: string | null): Promise<CampaignInvitation | null>
}

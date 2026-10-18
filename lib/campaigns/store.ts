import type { Campaign, CampaignClaim, CampaignStatus } from './model.ts'
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
  /** OPEN campaigns, newest first. */
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
}

import { randomUUID } from 'node:crypto'
import { RepoError } from '../db/repo.ts'
import { normalizeAddress } from '../nimiq/address.ts'
import { CLAIM_BLOCKER_MESSAGE, SLOT_RELEASING, canCampaignTransition, claimBlocker } from './model.ts'
import type { Campaign, CampaignClaim, CampaignInvitation, CampaignStatus, InvitationStatus } from './model.ts'
import type { CampaignStore, ClaimRecord, CreateCampaignInput } from './store.ts'

const now = () => new Date().toISOString()

/**
 * In-process campaign store. The reference implementation: the Supabase one has to behave
 * the same way, including giving a slot back when its agreement is declined or cancelled.
 *
 * `pactStatusOf` is how it learns whether a claim's agreement still holds its slot,
 * without this module knowing anything about how pacts are stored.
 */
export class MemoryCampaignStore implements CampaignStore {
  private campaigns = new Map<string, Campaign>()
  private claims = new Map<string, CampaignClaim>()
  private invitations = new Map<string, CampaignInvitation>()

  private readonly pactStatusOf: (pactId: string) => Promise<string | null>

  constructor(pactStatusOf: (pactId: string) => Promise<string | null>) {
    this.pactStatusOf = pactStatusOf
  }

  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    const timestamp = now()
    const campaign: Campaign = {
      id: randomUUID(),
      ...input,
      ownerAddress: normalizeAddress(input.ownerAddress),
      status: 'OPEN',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.campaigns.set(campaign.id, campaign)
    return campaign
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    return this.campaigns.get(id) ?? null
  }

  async listOpen(limit: number): Promise<Campaign[]> {
    return [...this.campaigns.values()]
      .filter((c) => c.status === 'OPEN' && c.visibility === 'PUBLIC')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  async listByOwner(address: string): Promise<Campaign[]> {
    const owner = normalizeAddress(address)
    return [...this.campaigns.values()]
      .filter((c) => c.ownerAddress === owner)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async setStatus(id: string, status: CampaignStatus): Promise<Campaign> {
    const current = this.campaigns.get(id)
    if (!current) throw new RepoError('NOT_FOUND', 'That campaign does not exist.')
    if (current.status === status) return current
    if (!canCampaignTransition(current.status, status)) {
      throw new RepoError('CONFLICT', `A ${current.status.toLowerCase()} campaign cannot become ${status.toLowerCase()}.`)
    }
    const next = { ...current, status, updatedAt: now() }
    this.campaigns.set(id, next)
    return next
  }

  private async holding(campaignId: string): Promise<ClaimRecord[]> {
    const all = await this.listClaims(campaignId)
    return all.filter((c) => !c.pactStatus || !SLOT_RELEASING.includes(c.pactStatus))
  }

  // The check and the insert both await, so two callers could each see room for the last
  // slot. Taking turns is the in-process equivalent of the database's row lock.
  private turn: Promise<unknown> = Promise.resolve()

  reserveSlot(campaignId: string, jobber: string, today: string): Promise<CampaignClaim> {
    const run = this.turn.then(() => this.reserve(campaignId, jobber, today))
    this.turn = run.catch(() => undefined)
    return run
  }

  private async reserve(campaignId: string, jobber: string, today: string): Promise<CampaignClaim> {
    const campaign = this.campaigns.get(campaignId)
    if (!campaign) throw new RepoError('NOT_FOUND', 'That campaign does not exist.')

    const who = normalizeAddress(jobber)
    const held = await this.holding(campaignId)
    const alreadyClaimed = [...this.claims.values()].some((c) => c.campaignId === campaignId && c.jobberAddress === who)

    const blocker = claimBlocker({ campaign, taken: held.length, jobber: who, alreadyClaimed, today })
    if (blocker) {
      throw new RepoError(blocker === 'NOT_OPEN' || blocker === 'OWN_CAMPAIGN' ? 'NOT_ALLOWED' : 'CONFLICT', CLAIM_BLOCKER_MESSAGE[blocker])
    }

    const claim: CampaignClaim = {
      id: randomUUID(),
      campaignId,
      jobberAddress: who,
      pactId: null,
      createdAt: now(),
    }
    this.claims.set(claim.id, claim)
    return claim
  }

  async attachPact(claimId: string, pactId: string): Promise<CampaignClaim> {
    const claim = this.claims.get(claimId)
    if (!claim) throw new RepoError('NOT_FOUND', 'That claim does not exist.')
    const next = { ...claim, pactId }
    this.claims.set(claimId, next)
    return next
  }

  async releaseClaim(claimId: string): Promise<void> {
    this.claims.delete(claimId)
  }

  private async withStatus(claim: CampaignClaim): Promise<ClaimRecord> {
    return { ...claim, pactStatus: claim.pactId ? await this.pactStatusOf(claim.pactId) : null }
  }

  async listClaims(campaignId: string): Promise<ClaimRecord[]> {
    const rows = [...this.claims.values()]
      .filter((c) => c.campaignId === campaignId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return Promise.all(rows.map((c) => this.withStatus(c)))
  }

  async listClaimsForCampaigns(campaignIds: string[]): Promise<ClaimRecord[]> {
    const wanted = new Set(campaignIds)
    const rows = [...this.claims.values()].filter((c) => wanted.has(c.campaignId))
    return Promise.all(rows.map((c) => this.withStatus(c)))
  }

  async listClaimsForJobber(address: string): Promise<Array<ClaimRecord & { campaign: Campaign }>> {
    const who = normalizeAddress(address)
    const rows = [...this.claims.values()].filter((c) => c.jobberAddress === who)
    const withStatus = await Promise.all(rows.map((c) => this.withStatus(c)))
    return withStatus.flatMap((c) => {
      const campaign = this.campaigns.get(c.campaignId)
      return campaign ? [{ ...c, campaign }] : []
    })
  }

  async getClaimByPact(pactId: string): Promise<ClaimRecord | null> {
    const claim = [...this.claims.values()].find((c) => c.pactId === pactId)
    return claim ? this.withStatus(claim) : null
  }

  async createInvitation(input: {
    campaignId: string
    inviteeAddress: string
    invitedBy: string
    via: 'HANDLE' | 'ADDRESS'
  }): Promise<CampaignInvitation> {
    const invitee = normalizeAddress(input.inviteeAddress)
    const existing = await this.findInvitation(input.campaignId, invitee)
    if (existing) return existing
    const timestamp = now()
    const invitation: CampaignInvitation = {
      id: randomUUID(),
      campaignId: input.campaignId,
      inviteeAddress: invitee,
      invitedBy: normalizeAddress(input.invitedBy),
      via: input.via,
      status: 'PENDING',
      pactId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.invitations.set(invitation.id, invitation)
    return invitation
  }

  async getInvitation(id: string): Promise<CampaignInvitation | null> {
    return this.invitations.get(id) ?? null
  }

  async listInvitationsForCampaign(campaignId: string): Promise<CampaignInvitation[]> {
    return [...this.invitations.values()]
      .filter((i) => i.campaignId === campaignId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async listInvitationsForInvitee(address: string): Promise<CampaignInvitation[]> {
    const who = normalizeAddress(address)
    return [...this.invitations.values()]
      .filter((i) => i.inviteeAddress === who)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async findInvitation(campaignId: string, address: string): Promise<CampaignInvitation | null> {
    const who = normalizeAddress(address)
    return [...this.invitations.values()].find((i) => i.campaignId === campaignId && i.inviteeAddress === who) ?? null
  }

  async setInvitationStatus(
    id: string,
    from: InvitationStatus,
    to: InvitationStatus,
    pactId?: string | null,
  ): Promise<CampaignInvitation | null> {
    const current = this.invitations.get(id)
    if (!current || current.status !== from) return null
    const next = { ...current, status: to, pactId: pactId === undefined ? current.pactId : pactId, updatedAt: now() }
    this.invitations.set(id, next)
    return next
  }
}

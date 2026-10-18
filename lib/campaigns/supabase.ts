import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { RepoError } from '../db/repo.ts'
import { normalizeAddress } from '../nimiq/address.ts'
import { CLAIM_BLOCKER_MESSAGE, canCampaignTransition } from './model.ts'
import type { Campaign, CampaignClaim, CampaignStatus, ClaimBlocker } from './model.ts'
import type { CampaignStore, ClaimRecord, CreateCampaignInput } from './store.ts'
import type { Currency, EvmChainKey } from '../pact/types.ts'

type Row = Record<string, unknown>

const COLUMNS =
  'id, owner_address, owner_name, title, brief, requirements, currency, chain, reward_minor::text, slots, deadline, status, created_at, updated_at'
const CLAIM_COLUMNS = 'id, campaign_id, jobber_address, pact_id, created_at'

const str = (v: unknown) => (v == null ? '' : String(v))
const nullable = (v: unknown) => (v == null ? null : String(v))

function toCampaign(row: Row): Campaign {
  return {
    id: str(row.id),
    ownerAddress: str(row.owner_address),
    ownerName: str(row.owner_name),
    title: str(row.title),
    brief: str(row.brief),
    requirements: Array.isArray(row.requirements) ? (row.requirements as string[]) : [],
    currency: str(row.currency) as Currency,
    chain: (nullable(row.chain) as EvmChainKey | null) ?? null,
    rewardMinor: str(row.reward_minor),
    slots: Number(row.slots),
    deadline: nullable(row.deadline),
    status: str(row.status) as CampaignStatus,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  }
}

function toClaim(row: Row): CampaignClaim {
  return {
    id: str(row.id),
    campaignId: str(row.campaign_id),
    jobberAddress: str(row.jobber_address),
    pactId: nullable(row.pact_id),
    createdAt: str(row.created_at),
  }
}

function toRecord(row: Row): ClaimRecord {
  const pact = row.pact as { status?: unknown } | null | undefined
  return { ...toClaim(row), pactStatus: pact?.status ? String(pact.status) : null }
}

/** The function raises these strings; map them onto the same blockers the in-process store uses. */
const RAISED: Record<string, ClaimBlocker> = {
  CAMPAIGN_NOT_OPEN: 'NOT_OPEN',
  CAMPAIGN_EXPIRED: 'EXPIRED',
  OWN_CAMPAIGN: 'OWN_CAMPAIGN',
  CAMPAIGN_FULL: 'FULL',
}

function fail(error: { code?: string; message: string } | null, fallback: string): never {
  if (error?.code === '23505') throw new RepoError('CONFLICT', 'That already exists.')
  if (error?.code === '23514') throw new RepoError('INVALID', 'That value is not allowed.')
  throw new RepoError('INVALID', error?.message ?? fallback)
}

export class SupabaseCampaignStore implements CampaignStore {
  private readonly db

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      db: { schema: 'pact' },
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  private async ensureUser(address: string): Promise<string> {
    const normalized = normalizeAddress(address)
    const { error } = await this.db
      .from('users')
      .upsert({ address: normalized, last_seen_at: new Date().toISOString() }, { onConflict: 'address' })
    if (error) fail(error, 'Could not record that address.')
    return normalized
  }

  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    const owner = await this.ensureUser(input.ownerAddress)
    const { data, error } = await this.db
      .from('campaigns')
      .insert({
        owner_address: owner,
        owner_name: input.ownerName,
        title: input.title,
        brief: input.brief,
        requirements: input.requirements,
        currency: input.currency,
        chain: input.chain,
        reward_minor: input.rewardMinor,
        slots: input.slots,
        deadline: input.deadline,
      })
      .select(COLUMNS)
      .single()
    if (error || !data) fail(error, 'Could not create that campaign.')
    return toCampaign(data as Row)
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const { data, error } = await this.db.from('campaigns').select(COLUMNS).eq('id', id).maybeSingle()
    if (error) {
      // A malformed id is "not found" to the caller, not a server fault.
      if (error.code === '22P02') return null
      fail(error, 'Could not load that campaign.')
    }
    return data ? toCampaign(data as Row) : null
  }

  async listOpen(limit: number): Promise<Campaign[]> {
    const { data, error } = await this.db
      .from('campaigns')
      .select(COLUMNS)
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) fail(error, 'Could not list campaigns.')
    return (data ?? []).map((r) => toCampaign(r as Row))
  }

  async listByOwner(address: string): Promise<Campaign[]> {
    const { data, error } = await this.db
      .from('campaigns')
      .select(COLUMNS)
      .eq('owner_address', normalizeAddress(address))
      .order('created_at', { ascending: false })
    if (error) fail(error, 'Could not list campaigns.')
    return (data ?? []).map((r) => toCampaign(r as Row))
  }

  async setStatus(id: string, status: CampaignStatus): Promise<Campaign> {
    const current = await this.getCampaign(id)
    if (!current) throw new RepoError('NOT_FOUND', 'That campaign does not exist.')
    if (current.status === status) return current
    if (!canCampaignTransition(current.status, status)) {
      throw new RepoError('CONFLICT', `A ${current.status.toLowerCase()} campaign cannot become ${status.toLowerCase()}.`)
    }
    // Compare-and-set, so two owners' tabs cannot both move it from the same state.
    const { data, error } = await this.db
      .from('campaigns')
      .update({ status })
      .eq('id', id)
      .eq('status', current.status)
      .select(COLUMNS)
      .maybeSingle()
    if (error) fail(error, 'Could not update that campaign.')
    if (!data) throw new RepoError('CONFLICT', 'That campaign changed while you were updating it.')
    return toCampaign(data as Row)
  }

  async reserveSlot(campaignId: string, jobber: string, _today: string): Promise<CampaignClaim> {
    const who = await this.ensureUser(jobber)
    const { data, error } = await this.db.rpc('claim_campaign_slot', { p_campaign: campaignId, p_jobber: who })

    if (error) {
      if (error.code === '23505') throw new RepoError('CONFLICT', CLAIM_BLOCKER_MESSAGE.ALREADY_CLAIMED)
      if (error.code === '22P02' || error.message.includes('CAMPAIGN_NOT_FOUND')) {
        throw new RepoError('NOT_FOUND', 'That campaign does not exist.')
      }
      const blocker = Object.entries(RAISED).find(([raised]) => error.message.includes(raised))?.[1]
      if (blocker) {
        throw new RepoError(
          blocker === 'NOT_OPEN' || blocker === 'OWN_CAMPAIGN' ? 'NOT_ALLOWED' : 'CONFLICT',
          CLAIM_BLOCKER_MESSAGE[blocker],
        )
      }
      fail(error, 'Could not take up that campaign.')
    }

    const { data: row, error: readError } = await this.db
      .from('campaign_claims')
      .select(CLAIM_COLUMNS)
      .eq('id', String(data))
      .single()
    if (readError || !row) fail(readError, 'Could not read that claim.')
    return toClaim(row as Row)
  }

  async attachPact(claimId: string, pactId: string): Promise<CampaignClaim> {
    const { data, error } = await this.db
      .from('campaign_claims')
      .update({ pact_id: pactId })
      .eq('id', claimId)
      .select(CLAIM_COLUMNS)
      .maybeSingle()
    if (error) fail(error, 'Could not link that agreement.')
    if (!data) throw new RepoError('NOT_FOUND', 'That claim does not exist.')
    return toClaim(data as Row)
  }

  async releaseClaim(claimId: string): Promise<void> {
    await this.db.from('campaign_claims').delete().eq('id', claimId)
  }

  private async claimsWhere(column: 'campaign_id' | 'jobber_address' | 'pact_id', values: string[]): Promise<ClaimRecord[]> {
    if (values.length === 0) return []
    const { data, error } = await this.db
      .from('campaign_claims')
      .select(`${CLAIM_COLUMNS}, pact:pacts(status)`)
      .in(column, values)
      .order('created_at', { ascending: true })
    if (error) fail(error, 'Could not load claims.')
    return (data ?? []).map((r) => toRecord(r as Row))
  }

  listClaims(campaignId: string) {
    return this.claimsWhere('campaign_id', [campaignId])
  }

  listClaimsForCampaigns(campaignIds: string[]) {
    return this.claimsWhere('campaign_id', campaignIds)
  }

  async listClaimsForJobber(address: string): Promise<Array<ClaimRecord & { campaign: Campaign }>> {
    const claims = await this.claimsWhere('jobber_address', [normalizeAddress(address)])
    if (claims.length === 0) return []
    const { data, error } = await this.db
      .from('campaigns')
      .select(COLUMNS)
      .in('id', [...new Set(claims.map((c) => c.campaignId))])
    if (error) fail(error, 'Could not load campaigns.')
    const byId = new Map((data ?? []).map((r) => [str((r as Row).id), toCampaign(r as Row)]))
    return claims.flatMap((c) => {
      const campaign = byId.get(c.campaignId)
      return campaign ? [{ ...c, campaign }] : []
    })
  }

  async getClaimByPact(pactId: string): Promise<ClaimRecord | null> {
    return (await this.claimsWhere('pact_id', [pactId]))[0] ?? null
  }
}

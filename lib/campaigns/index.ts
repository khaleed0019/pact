import 'server-only'
import { getRepository } from '../db/index.ts'
import { MemoryCampaignStore } from './memory.ts'
import { SupabaseCampaignStore } from './supabase.ts'
import type { CampaignStore } from './store.ts'

declare global {
  // eslint-disable-next-line no-var
  var __pactCampaigns: CampaignStore | undefined
}

/**
 * Same selection rule as the pact repository: Supabase when configured, otherwise the
 * in-process store. A module-level singleton for the same reason — dev hot reloads must
 * not wipe a campaign someone is halfway through reading.
 */
export function getCampaignStore(): CampaignStore {
  if (!globalThis.__pactCampaigns) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    globalThis.__pactCampaigns =
      url && key
        ? new SupabaseCampaignStore(url, key)
        : new MemoryCampaignStore(async (pactId) => (await getRepository().getPactById(pactId))?.status ?? null)
  }
  return globalThis.__pactCampaigns
}

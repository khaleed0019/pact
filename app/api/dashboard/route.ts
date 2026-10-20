import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { getCampaignStore } from '@/lib/campaigns'
import { brandDashboard, contributorDashboard } from '@/lib/campaigns/dashboard'
import { authed, ok } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

/** The signed-in user's role dashboard. The role is read from storage, never the request. */
export async function GET(): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const repo = getRepository()
    const role = await repo.getRole(session.address)
    if (role === 'BRAND') return ok(await brandDashboard(repo, getCampaignStore(), session.address))
    if (role === 'CONTRIBUTOR') return ok(await contributorDashboard(repo, getCampaignStore(), session.address))
    return ok({ role: null })
  })
}

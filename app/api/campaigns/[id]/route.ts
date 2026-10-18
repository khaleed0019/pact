import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { getCampaignStore } from '@/lib/campaigns'
import { claimBlocker } from '@/lib/campaigns/model'
import { countHolding, overviewOf } from '@/lib/campaigns/service'
import { summariseBudget } from '@/lib/campaigns/model'
import { fail, guard, ok } from '@/lib/api/handler'
import { readSession } from '@/lib/auth/session'
import { normalizeAddress } from '@/lib/nimiq/address'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * One campaign.
 *
 * Everyone gets the offer and how many spots are left. Only the owner gets the people who
 * took it up and what has been paid — that is their business, not a public ledger.
 */
export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  return guard(async () => {
    const { id } = await context.params
    const store = getCampaignStore()
    const campaign = await store.getCampaign(id)
    if (!campaign) return fail('INVITE_INVALID', 404, 'That campaign does not exist.')

    const session = await readSession()
    const me = session ? normalizeAddress(session.address) : null
    const records = await store.listClaims(campaign.id)
    const taken = countHolding(records)
    const mine = me ? records.find((r) => r.jobberAddress === me) ?? null : null

    const blocker = claimBlocker({
      campaign,
      taken,
      jobber: me,
      alreadyClaimed: !!mine,
      today: new Date().toISOString().slice(0, 10),
    })

    if (me && me === campaign.ownerAddress) {
      const overview = await overviewOf(getRepository(), store, campaign)
      return ok({ campaign, budget: overview.budget, viewer: 'OWNER', claims: overview.claims })
    }

    return ok({
      campaign,
      budget: summariseBudget(campaign, taken, '0'),
      viewer: me ? 'JOBBER' : 'GUEST',
      blocker,
      myPactId: mine?.pactId ?? null,
    })
  })
}

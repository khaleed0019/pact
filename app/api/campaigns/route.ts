import { NextResponse } from 'next/server'
import { getCampaignStore } from '@/lib/campaigns'
import { cardsFor } from '@/lib/campaigns/service'
import { authed, body, guard, ok } from '@/lib/api/handler'
import { createCampaignSchema } from '@/lib/api/schema'
import { readSession } from '@/lib/auth/session'
import type { EvmChainKey } from '@/lib/pact/types'

export const dynamic = 'force-dynamic'

/**
 * Open campaigns, for anyone. A campaign is a public offer by nature — that is the point
 * of it — so browsing needs no sign-in. If you are signed in you also get your own
 * campaigns and the ones you have taken up.
 */
export async function GET(): Promise<NextResponse> {
  return guard(async () => {
    const store = getCampaignStore()
    const session = await readSession()

    const open = await cardsFor(store, await store.listOpen(50))
    if (!session) return ok({ open, mine: [], claimed: [] })

    const mine = await cardsFor(store, await store.listByOwner(session.address))
    const claimed = (await store.listClaimsForJobber(session.address)).map((c) => ({
      campaign: c.campaign,
      pactId: c.pactId,
      pactStatus: c.pactStatus,
    }))
    return ok({ open, mine, claimed })
  })
}

export async function POST(request: Request): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const input = await body(request, createCampaignSchema)
    const campaign = await getCampaignStore().createCampaign({
      ownerAddress: session.address,
      ownerName: input.ownerName,
      title: input.title,
      brief: input.brief,
      requirements: input.requirements,
      currency: input.currency,
      chain: input.chain as EvmChainKey | null,
      rewardMinor: input.rewardMinor,
      slots: input.slots,
      deadline: input.deadline,
    })
    return ok({ campaign }, 201)
  })
}

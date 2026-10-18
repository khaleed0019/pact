import { NextResponse } from 'next/server'
import { getCampaignStore } from '@/lib/campaigns'
import { authed, body, fail, ok } from '@/lib/api/handler'
import { campaignStatusSchema } from '@/lib/api/schema'
import { normalizeAddress } from '@/lib/nimiq/address'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** Pause, reopen, close or cancel. Owner only; the allowed moves live in `canCampaignTransition`. */
export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const { status } = await body(request, campaignStatusSchema)

    const store = getCampaignStore()
    const campaign = await store.getCampaign(id)
    if (!campaign) return fail('INVITE_INVALID', 404, 'That campaign does not exist.')
    if (campaign.ownerAddress !== normalizeAddress(session.address)) {
      return fail('NOT_ALLOWED', 403, 'Only the person who posted this campaign can change it.')
    }

    return ok({ campaign: await store.setStatus(id, status) })
  })
}

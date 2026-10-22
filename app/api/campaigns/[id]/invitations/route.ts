import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { getCampaignStore } from '@/lib/campaigns'
import { inviteToCampaign } from '@/lib/campaigns/service'
import { authed, body, ok } from '@/lib/api/handler'
import { inviteTarget } from '@/lib/api/schema'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** Invite one more person to a campaign. Owner only; the target is resolved server-side. */
export async function POST(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const target = await body(request, inviteTarget)
    const invitation = await inviteToCampaign(getRepository(), getCampaignStore(), {
      campaignId: id,
      actor: session.address,
      target,
    })
    return ok({ invitation }, 201)
  })
}

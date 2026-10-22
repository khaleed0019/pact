import { NextResponse } from 'next/server'
import { getCampaignStore } from '@/lib/campaigns'
import { declineInvitation } from '@/lib/campaigns/service'
import { authed, ok } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** Decline an invitation addressed to the signed-in wallet. */
export async function POST(_request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    return ok({ invitation: await declineInvitation(getCampaignStore(), { invitationId: id, actor: session.address }) })
  })
}

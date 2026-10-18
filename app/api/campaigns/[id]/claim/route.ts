import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getRepository } from '@/lib/db'
import { getCampaignStore } from '@/lib/campaigns'
import { claimCampaign } from '@/lib/campaigns/service'
import { authed, body, ok } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const claimSchema = z.object({ name: z.string().trim().min(1).max(80) })

/**
 * Take a campaign up. Creates your own agreement with the brand; nothing is owed until
 * you have both signed it, and nothing is paid until the brand has approved your work.
 */
export async function POST(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const { name } = await body(request, claimSchema)

    const result = await claimCampaign(getRepository(), getCampaignStore(), {
      campaignId: id,
      jobberAddress: session.address,
      jobberName: name,
      today: new Date().toISOString().slice(0, 10),
    })
    return ok({ pactId: result.pact.id, claim: result.claim }, 201)
  })
}

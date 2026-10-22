import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getRepository } from '@/lib/db'
import { getCampaignStore } from '@/lib/campaigns'
import { acceptInvitation } from '@/lib/campaigns/service'
import { authed, body, ok } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const acceptSchema = z.object({ name: z.string().trim().min(1).max(80) })

/**
 * Accept an invitation addressed to the signed-in wallet. Creates the agreement, which
 * both sides then sign — accepting signs nothing. Anyone else gets 404.
 */
export async function POST(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const { name } = await body(request, acceptSchema)
    const result = await acceptInvitation(getRepository(), getCampaignStore(), {
      invitationId: id,
      actor: session.address,
      name,
      today: new Date().toISOString().slice(0, 10),
    })
    return ok({ invitation: result.invitation, pactId: result.pact.id }, 201)
  })
}

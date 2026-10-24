import { NextResponse } from 'next/server'
import { authed, body, ok } from '@/lib/api/handler'
import { missionDeps } from '@/lib/missions'
import { reviewDelivery } from '@/lib/missions/service'
import { reviewSchema } from '@/lib/missions/schema'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const input = await body(request, reviewSchema)
    return ok({ mission: await reviewDelivery(missionDeps(), id, session.address, input.decision, input.note) })
  })
}

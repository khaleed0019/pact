import { NextResponse } from 'next/server'
import { authed, body, ok } from '@/lib/api/handler'
import { missionDeps } from '@/lib/missions'
import { editPlan } from '@/lib/missions/service'
import { editPlanSchema } from '@/lib/missions/schema'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** Edit the proposed plan. Re-runs policy and clears any earlier approval. */
export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const input = await body(request, editPlanSchema)
    return ok({ mission: await editPlan(missionDeps(), id, session.address, input) })
  })
}

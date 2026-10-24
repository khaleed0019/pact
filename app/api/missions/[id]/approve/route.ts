import { NextResponse } from 'next/server'
import { authed, body, ok } from '@/lib/api/handler'
import { missionDeps } from '@/lib/missions'
import { approveMission } from '@/lib/missions/service'
import { approveSchema } from '@/lib/missions/schema'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** Approve exactly the terms the client displayed, identified by their fingerprint. */
export async function POST(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const { fingerprint } = await body(request, approveSchema)
    return ok({ mission: await approveMission(missionDeps(), id, session.address, fingerprint) })
  })
}

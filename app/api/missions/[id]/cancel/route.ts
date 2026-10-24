import { NextResponse } from 'next/server'
import { authed, ok } from '@/lib/api/handler'
import { missionDeps } from '@/lib/missions'
import { cancelMission } from '@/lib/missions/service'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    return ok({ mission: await cancelMission(missionDeps(), id, session.address) })
  })
}

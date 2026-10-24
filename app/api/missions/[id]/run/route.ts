import { NextResponse } from 'next/server'
import { authed, fail, ok } from '@/lib/api/handler'
import { allow } from '@/lib/api/rateLimit'
import { missionDeps } from '@/lib/missions'
import { runMission } from '@/lib/missions/service'

export const dynamic = 'force-dynamic'
// One run makes at most six short read-only requests, each with its own 9 s timeout.
export const maxDuration = 60

type Context = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    if (!allow(`mission-run:${session.address}`, 5, 60_000)) return fail('RATE_LIMITED', 429)
    const { id } = await context.params
    return ok({ mission: await runMission(missionDeps(), id, session.address) })
  })
}

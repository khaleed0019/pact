import { NextResponse } from 'next/server'
import { authed, ok } from '@/lib/api/handler'
import { missionDeps } from '@/lib/missions'
import { missionView } from '@/lib/missions/service'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** The mission, its audit log, and the current terms fingerprint the approve button must echo. */
export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    return ok(await missionView(missionDeps(), id, session.address))
  })
}

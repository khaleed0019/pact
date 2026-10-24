import { NextResponse } from 'next/server'
import { authed, body, fail, ok } from '@/lib/api/handler'
import { allow } from '@/lib/api/rateLimit'
import { missionDeps } from '@/lib/missions'
import { submitPayment } from '@/lib/missions/service'
import { submitPaymentSchema } from '@/lib/missions/schema'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** Record a transaction hash and read its status off NEAR testnet. Safe to call again while pending. */
export async function POST(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    if (!allow(`mission-verify:${session.address}`, 12, 60_000)) return fail('RATE_LIMITED', 429)
    const { id } = await context.params
    const input = await body(request, submitPaymentSchema)
    return ok({ mission: await submitPayment(missionDeps(), id, session.address, input) })
  })
}

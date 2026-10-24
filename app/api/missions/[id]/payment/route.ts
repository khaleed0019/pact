import { NextResponse } from 'next/server'
import { authed, ok } from '@/lib/api/handler'
import { missionDeps } from '@/lib/missions'
import { preparePayment } from '@/lib/missions/service'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Prepare a payment: re-check policy and show exactly what to send. Nothing is signed or
 * sent by PACT — the person sends it from their own NEAR testnet wallet.
 */
export async function POST(_request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    return ok({ mission: await preparePayment(missionDeps(), id, session.address) })
  })
}

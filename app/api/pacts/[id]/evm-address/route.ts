import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getRepository } from '@/lib/db'
import { authed, body, ok } from '@/lib/api/handler'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const schema = z.object({
  evmAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Expected a 20-byte EVM address.'),
})

/**
 * Record the caller's EVM address so they can be paid in USDT.
 *
 * A Nimiq address cannot receive an ERC-20 transfer. Nimiq Pay exposes one EVM address
 * per user through `window.ethereum`, so the client reads it from the wallet and posts
 * it here — the user is never asked to type or paste an address, which is both the worst
 * possible mobile task and the easiest place to lose money to a typo.
 *
 * The address is only ever set for the caller's own participant row. It is not part of
 * the terms digest, so recording it does not invalidate a signature.
 */
export async function PUT(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const { evmAddress } = await body(request, schema)

    const pact = await loadPact(id)
    viewerOf(pact, session.address) // membership check

    return ok({ pact: await getRepository().setEvmAddress(id, session.address, evmAddress) })
  })
}

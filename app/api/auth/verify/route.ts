import { NextResponse } from 'next/server'
import { consumeNonce, createSession } from '@/lib/auth/session'
import { buildLoginMessage, verifySignature } from '@/lib/nimiq/verify'
import { body, fail, guard, ok } from '@/lib/api/handler'
import { verifySchema } from '@/lib/api/schema'

export const dynamic = 'force-dynamic'

/**
 * Step two: verify the signature and mint a session.
 *
 * Note what is *not* in the request body: an address. The client cannot tell us who it
 * is. We recompute the message from the nonce we issued, verify the Ed25519 signature
 * against the supplied public key, and derive the address from that key ourselves.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return guard(async () => {
    const input = await body(request, verifySchema)

    // Spend the nonce first, so a failed attempt cannot be retried against the same one.
    if (!(await consumeNonce(input.nonce))) {
      return fail('NOT_ALLOWED', 401, 'That sign-in request expired. Try again.')
    }

    const origin = new URL(request.url).origin
    const result = verifySignature({
      message: buildLoginMessage(input.nonce, origin),
      publicKey: input.publicKey,
      signature: input.signature,
    })

    if (!result.ok) return fail('NOT_ALLOWED', 401, result.reason)

    await createSession({ address: result.address, encoding: result.encoding })
    return ok({ address: result.address, encoding: result.encoding })
  })
}

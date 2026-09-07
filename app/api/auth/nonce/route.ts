import { NextResponse } from 'next/server'
import { issueNonce } from '@/lib/auth/session'
import { buildLoginMessage } from '@/lib/nimiq/verify'
import { guard, ok } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

/**
 * Step one of Sign-In With Nimiq: hand out a challenge.
 *
 * The server returns the *exact message* to sign rather than letting the client compose
 * it. That way the string the wallet shows the user, the string that gets signed, and the
 * string the verifier reconstructs are the same by construction.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return guard(async () => {
    const nonce = await issueNonce()
    const origin = new URL(request.url).origin
    return ok({ nonce, message: buildLoginMessage(nonce, origin) })
  })
}

import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { fail, guard, ok } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ shortId: string }> }

/**
 * The one route in this app that answers without a session.
 *
 * It returns a `VerificationRecord` — never a `PactDetail` — and the repository returns
 * null for anything still PRIVATE. That means a private agreement and a short id that was
 * never issued are indistinguishable from out here: both are a plain 404, with no timing
 * or wording difference to probe at.
 *
 * `shortId` is 8 Crockford characters, so guessing one is not a practical attack, but the
 * response is deliberately shaped as though it might be: the URL is the capability, and
 * everything it discloses is something a participant chose to disclose.
 */
export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  return guard(async () => {
    const { shortId } = await context.params
    const record = await getRepository().getVerificationRecord(shortId)
    if (!record) return fail('INVITE_INVALID', 404, 'No public record matches that reference.')
    return ok({ record })
  })
}

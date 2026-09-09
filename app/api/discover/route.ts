import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { guard, ok } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

/**
 * Publicly listed agreements.
 *
 * Unauthenticated, like `/api/verify/[shortId]`, and serving the same redacted record —
 * so nothing appears here that would not already be visible to someone holding the link.
 *
 * PUBLIC only. SHAREABLE deliberately does not appear: "anyone with the link can check
 * this" and "list this in a public directory" are different consents, and a shareable
 * pact was given the first one, not the second.
 */
const LIMIT = 30

export async function GET(): Promise<NextResponse> {
  return guard(async () => {
    const records = await getRepository().listPublicRecords(LIMIT)
    return ok({ records })
  })
}

import { NextResponse } from 'next/server'
import { createSession } from '@/lib/auth/session'
import { DEMO_VIEWER } from '@/lib/db/seed'
import { guard, ok } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

/**
 * Demo sign-in.
 *
 * Explore Demo signs you in as the seeded viewer so every screen has real content. The
 * session is marked `demo` rather than carrying a verified encoding, and the UI reads
 * that flag to show a persistent "demo data" banner — a demo must never be mistakable
 * for a signed, on-chain agreement.
 */
export async function POST(): Promise<NextResponse> {
  return guard(async () => {
    await createSession({ address: DEMO_VIEWER.address, encoding: 'demo' })
    return ok({ address: DEMO_VIEWER.address, name: DEMO_VIEWER.name, demo: true })
  })
}

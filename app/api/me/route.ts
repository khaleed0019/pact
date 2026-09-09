import { NextResponse } from 'next/server'
import { readSession } from '@/lib/auth/session'
import { getRepository, isEphemeralStore } from '@/lib/db'
import { authed, body, guard, ok } from '@/lib/api/handler'
import { updateProfileSchema } from '@/lib/api/schema'
import { isModelConfigured } from '@/lib/ai/client'

export const dynamic = 'force-dynamic'

/**
 * Everything the shell needs on load, in one request.
 *
 * Deliberately one round trip rather than four: this fires on every cold start inside a
 * mobile WebView, and four sequential requests on a slow connection is the difference
 * between an app that feels instant and one that feels broken.
 *
 * Returns 200 with `signedIn: false` rather than 401 — not being signed in yet is the
 * normal first state, not an error worth a red console entry.
 */
export async function GET(): Promise<NextResponse> {
  return guard(async () => {
    const session = await readSession()
    const capabilities = { aiModel: isModelConfigured(), ephemeralStore: isEphemeralStore() }

    if (!session) return ok({ signedIn: false, capabilities })

    const repo = getRepository()
    const [pacts, trust, notifications] = await Promise.all([
      repo.listPactsForAddress(session.address),
      repo.getTrustMetrics(session.address),
      repo.refreshNotifications(session.address),
    ])

    return ok({
      signedIn: true,
      address: session.address,
      demo: session.encoding === 'demo',
      displayName: trust.displayName || 'You',
      pacts,
      trust,
      notifications,
      capabilities,
    })
  })
}

/**
 * Edit your own display name.
 *
 * This is the one thing about you PACT lets you change directly rather than derive from
 * pact activity — everything else on the trust profile (completed count, on-time rate,
 * value settled) is a count of what actually happened and isn't something you can edit.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const input = await body(request, updateProfileSchema)
    await getRepository().updateProfile(session.address, input.displayName)
    return ok({ displayName: input.displayName })
  })
}

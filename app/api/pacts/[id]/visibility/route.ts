import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, ok } from '@/lib/api/handler'
import { visibilitySchema } from '@/lib/api/schema'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Change who can see an agreement.
 *
 * Either participant may do this, and either may put it back — a pact is jointly theirs,
 * so neither needs the other's permission to stop publishing it. Deliberately not
 * narrated onto the timeline: the timeline is the shared record of what happened *in the
 * agreement*, and cluttering it with "made this shareable, made it private again" would
 * dilute the thing it exists to be.
 */
export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const { visibility } = await body(request, visibilitySchema)

    const pact = await loadPact(id)
    viewerOf(pact, session.address) // membership check, throws 403 otherwise

    const updated = await getRepository().setVisibility(id, session.address, visibility)
    return ok({ pact: updated })
  })
}

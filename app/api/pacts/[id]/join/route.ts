import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, fail, ok } from '@/lib/api/handler'
import { joinSchema } from '@/lib/api/schema'
import { loadPact } from '@/lib/api/pact-helpers'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Accept an invitation and become the counterparty.
 *
 * The invite token is checked against the pact it was issued for. Without that check a
 * valid token for one agreement would let someone join a different one — the classic
 * insecure-direct-object-reference, just with an extra step.
 */
export async function POST(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const input = await body(request, joinSchema)

    const pact = await loadPact(id)
    const repo = getRepository()

    if (input.token) {
      const invitation = await repo.getInvitationByToken(input.token)
      if (!invitation || invitation.pactId !== id) return fail('INVITE_INVALID', 404)
      if (new Date(invitation.expiresAt).getTime() < Date.now()) return fail('INVITE_EXPIRED', 410)
      await repo.acceptInvitation(input.token, session.address)
    }

    const updated = await repo.joinPact(id, session.address, input.displayName)

    await repo.addActivity({
      pactId: id,
      kind: 'PACT_SENT',
      actorAddress: session.address,
      actorName: input.displayName,
      summary: `${input.displayName} opened this agreement`,
    })

    return ok({ pact: updated, previousStatus: pact.status })
  })
}

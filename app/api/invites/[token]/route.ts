import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { fail, guard, ok } from '@/lib/api/handler'
import { formatWithCurrency } from '@/lib/pact/money'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

/**
 * Preview an invitation *before* signing in.
 *
 * Someone opening a share link should be able to see what they are being asked to agree
 * to before they connect a wallet. Asking for a signature first would be exactly the
 * pattern users are rightly taught to distrust.
 *
 * Only the headline terms are exposed — enough to decide, not the full participant and
 * payment history of an agreement the viewer has not yet joined.
 */
export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  return guard(async () => {
    const { token } = await context.params
    const repo = getRepository()

    const invitation = await repo.getInvitationByToken(token)
    if (!invitation) return fail('INVITE_INVALID', 404)
    if (new Date(invitation.expiresAt).getTime() < Date.now()) return fail('INVITE_EXPIRED', 410)

    const pact = await repo.getPactById(invitation.pactId)
    if (!pact) return fail('INVITE_INVALID', 404)

    const inviter = pact.participants.find((p) => p.role !== invitation.role)

    return ok({
      invitation: { token: invitation.token, role: invitation.role, expiresAt: invitation.expiresAt },
      preview: {
        id: pact.id,
        shortId: pact.shortId,
        title: pact.title,
        deliverable: pact.deliverable,
        amountLabel: formatWithCurrency(pact.totalAmountMinor, pact.currency),
        currency: pact.currency,
        chain: pact.chain,
        deadline: pact.deadline,
        paymentCondition: pact.paymentCondition,
        specialTerms: pact.specialTerms,
        termsDigest: pact.termsDigest,
        status: pact.status,
        milestones: pact.milestones.map((m) => ({
          title: m.title,
          amountLabel: formatWithCurrency(m.amountMinor, pact.currency),
          dueDate: m.dueDate,
        })),
        invitedBy: inviter?.displayName ?? 'Someone',
        yourRole: invitation.role,
      },
    })
  })
}

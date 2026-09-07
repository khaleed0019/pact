import { NextResponse } from 'next/server'
import { explainPact } from '@/lib/ai/client'
import { authed, ok } from '@/lib/api/handler'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'
import { formatWithCurrency } from '@/lib/pact/money'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Explain This Pact.
 *
 * The explanation is written from the caller's side of the agreement, which is why this
 * reads the pact server-side rather than taking terms from the client: "what you must do"
 * is only correct if the role it is written for is the role the reader actually holds.
 */
export async function POST(_request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const pact = await loadPact(id)
    const viewer = viewerOf(pact, session.address)

    const result = await explainPact({
      title: pact.title,
      deliverable: pact.deliverable,
      currency: pact.currency,
      totalAmountMinor: pact.totalAmountMinor,
      amountLabel: formatWithCurrency(pact.totalAmountMinor, pact.currency),
      deadline: pact.deadline,
      paymentCondition: pact.paymentCondition,
      specialTerms: pact.specialTerms,
      viewerRole: viewer.role,
      milestones: pact.milestones.map((m) => ({ title: m.title, amountMinor: m.amountMinor, dueDate: m.dueDate })),
    })

    return ok({ explanation: result.data, source: result.source, role: viewer.role })
  })
}

import { NextResponse } from 'next/server'
import { reviewPact } from '@/lib/ai/client'
import { authed, body, ok } from '@/lib/api/handler'
import { aiReviewSchema } from '@/lib/api/schema'
import { formatWithCurrency } from '@/lib/pact/money'

export const dynamic = 'force-dynamic'

/** Smart Review — run against the draft before it is sent, never against a sealed pact. */
export async function POST(request: Request): Promise<NextResponse> {
  return authed(async () => {
    const input = await body(request, aiReviewSchema)
    const result = await reviewPact({
      title: input.title,
      deliverable: input.deliverable,
      currency: input.currency,
      amountLabel: formatWithCurrency(input.totalAmountMinor, input.currency),
      deadline: input.deadline,
      paymentCondition: input.paymentCondition,
      specialTerms: input.specialTerms,
      milestones: input.milestones,
      today: new Date().toISOString().slice(0, 10),
    })
    return ok({ review: result.data, source: result.source })
  })
}

import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, fail, ok } from '@/lib/api/handler'
import { createPactSchema } from '@/lib/api/schema'
import { splitByPercent, sumMinor } from '@/lib/pact/money'
import type { EvmChainKey } from '@/lib/pact/types'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  return authed(async ({ session }) => ok({ pacts: await getRepository().listPactsForAddress(session.address) }))
}

export async function POST(request: Request): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const input = await body(request, createPactSchema)

    /*
     * Milestone amounts are recomputed here from percentages rather than trusted from the
     * client. A client that sent amounts adding up to more than the total would create an
     * agreement whose parts do not match its whole — and the digest both parties sign
     * would commit them to that inconsistency.
     */
    let milestones = input.milestones
    if (milestones.length > 0) {
      const amounts = splitByPercent(
        input.totalAmountMinor,
        milestones.map((m) => m.percent),
      )
      milestones = milestones.map((m, index) => ({ ...m, amountMinor: amounts[index] }))

      if (sumMinor(amounts) !== input.totalAmountMinor) {
        return fail('VALIDATION', 422, 'Milestone percentages must add up to 100.')
      }
    }

    const repo = getRepository()
    const pact = await repo.createPact({
      createdBy: session.address,
      category: input.category,
      creatorRole: input.creatorRole,
      creatorName: input.creatorName,
      counterpartyName: input.counterpartyName,
      counterpartyAddress: input.counterpartyAddress,
      title: input.title,
      deliverable: input.deliverable,
      currency: input.currency,
      chain: input.chain as EvmChainKey | null,
      totalAmountMinor: input.totalAmountMinor,
      deadline: input.deadline,
      paymentCondition: input.paymentCondition,
      specialTerms: input.specialTerms,
      milestones: milestones.map((m) => ({
        title: m.title,
        description: m.description,
        amountMinor: m.amountMinor,
        percent: m.percent,
        dueDate: m.dueDate,
      })),
    })

    // Every pact gets an invite the moment it exists — the share link is the growth loop,
    // so it must never be a second step the creator has to go looking for.
    const invitation = await repo.createInvitation({
      pactId: pact.id,
      role: input.creatorRole === 'CLIENT' ? 'PROVIDER' : 'CLIENT',
      createdBy: session.address,
    })

    return ok({ pact, invitation }, 201)
  })
}

import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, ok } from '@/lib/api/handler'
import { updateTermsSchema } from '@/lib/api/schema'
import { loadPact, viewerOf } from '@/lib/api/pact-helpers'
import { splitByPercent } from '@/lib/pact/money'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const pact = await loadPact(id)
    const viewer = viewerOf(pact, session.address) // membership check, throws 403 otherwise
    return ok({ pact, viewer })
  })
}

export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const input = await body(request, updateTermsSchema)

    const pact = await loadPact(id)
    const viewer = viewerOf(pact, session.address)

    // As on create: amounts are derived from percentages server-side, never trusted.
    const milestones = input.milestones
      ? (() => {
          const total = input.totalAmountMinor ?? pact.totalAmountMinor
          const amounts = splitByPercent(total, input.milestones.map((m) => m.percent))
          return input.milestones.map((m, index) => ({ ...m, amountMinor: amounts[index] }))
        })()
      : undefined

    const repo = getRepository()
    const updated = await repo.updateTerms(id, session.address, { ...input, milestones })

    await repo.addActivity({
      pactId: id,
      kind: 'PACT_CREATED',
      actorAddress: session.address,
      actorName: viewer.displayName,
      summary: `${viewer.displayName} edited the terms`,
      // The fingerprint moved, so any signature taken before this is void. Recording the
      // new one on the timeline is what makes that visible rather than silent.
      meta: { fingerprint: updated.termsDigest },
    })

    return ok({ pact: updated })
  })
}

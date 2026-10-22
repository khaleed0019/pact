import { NextResponse } from 'next/server'
import { getCampaignStore } from '@/lib/campaigns'
import { cardsFor, inviteToCampaign, postCampaign, resolveInvitee } from '@/lib/campaigns/service'
import { authed, body, guard, ok } from '@/lib/api/handler'
import { createCampaignSchema } from '@/lib/api/schema'
import { getRepository } from '@/lib/db'
import { readSession } from '@/lib/auth/session'
import type { EvmChainKey } from '@/lib/pact/types'

export const dynamic = 'force-dynamic'

/**
 * The marketplace (public campaigns only), plus — when signed in — your own campaigns,
 * the ones you have taken up, and invitations waiting for you.
 *
 * Private campaigns are never in `open`. They reach a contributor only through an
 * invitation bound to their address.
 */
export async function GET(): Promise<NextResponse> {
  return guard(async () => {
    const store = getCampaignStore()
    const session = await readSession()

    const open = await cardsFor(store, await store.listOpen(50))
    if (!session) return ok({ open, mine: [], claimed: [], invitations: [] })

    const [mine, claimedRows, invitationRows] = await Promise.all([
      store.listByOwner(session.address).then((c) => cardsFor(store, c)),
      store.listClaimsForJobber(session.address),
      store.listInvitationsForInvitee(session.address),
    ])
    const claimed = claimedRows.map((c) => ({ campaign: c.campaign, pactId: c.pactId, pactStatus: c.pactStatus }))

    const invitations = []
    for (const invitation of invitationRows.filter((i) => i.status === 'PENDING')) {
      const campaign = await store.getCampaign(invitation.campaignId)
      if (campaign && (campaign.status === 'OPEN' || campaign.status === 'PAUSED')) {
        invitations.push({ invitation, ...(await cardsFor(store, [campaign]))[0] })
      }
    }
    return ok({ open, mine, claimed, invitations })
  })
}

export async function POST(request: Request): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const input = await body(request, createCampaignSchema)
    const repo = getRepository()
    const store = getCampaignStore()

    // Check every invite target before creating anything, so a typo in one handle does
    // not leave a half-sent private campaign behind.
    for (const target of input.invite) await resolveInvitee(repo, target, session.address)

    // Brands only; the role is read from storage for the signed-in address (see postCampaign).
    const campaign = await postCampaign(repo, store, {
      ownerAddress: session.address,
      ownerName: input.ownerName,
      title: input.title,
      brief: input.brief,
      requirements: input.requirements,
      currency: input.currency,
      chain: input.chain as EvmChainKey | null,
      rewardMinor: input.rewardMinor,
      slots: input.slots,
      deadline: input.deadline,
      visibility: input.visibility,
      category: input.category,
      submissionInstructions: input.submissionInstructions,
      platform: input.platform,
      revisionLimit: input.revisionLimit,
    })

    const invitations = []
    for (const target of input.invite) {
      invitations.push(await inviteToCampaign(repo, store, { campaignId: campaign.id, actor: session.address, target }))
    }
    return ok({ campaign, invitations }, 201)
  })
}

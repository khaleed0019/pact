import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { getCampaignStore } from '@/lib/campaigns'
import { claimBlocker } from '@/lib/campaigns/model'
import { canViewCampaign, countHolding, overviewOf } from '@/lib/campaigns/service'
import { summariseBudget } from '@/lib/campaigns/model'
import { fail, guard, ok } from '@/lib/api/handler'
import { readSession } from '@/lib/auth/session'
import { normalizeAddress } from '@/lib/nimiq/address'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * One campaign.
 *
 * Everyone gets the offer and how many spots are left. Only the owner gets the people who
 * took it up and what has been paid — that is their business, not a public ledger.
 */
export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  return guard(async () => {
    const { id } = await context.params
    const store = getCampaignStore()
    const campaign = await store.getCampaign(id)
    if (!campaign) return fail('INVITE_INVALID', 404, 'That campaign does not exist.')

    const session = await readSession()
    const me = session ? normalizeAddress(session.address) : null
    // A private campaign is "not found" to anyone without a reason to see it.
    if (!(await canViewCampaign(store, campaign, me))) return fail('INVITE_INVALID', 404, 'That campaign does not exist.')
    const records = await store.listClaims(campaign.id)
    const taken = countHolding(records)
    const mine = me ? records.find((r) => r.jobberAddress === me) ?? null : null

    const blocker = claimBlocker({
      campaign,
      taken,
      jobber: me,
      alreadyClaimed: !!mine,
      today: new Date().toISOString().slice(0, 10),
    })

    if (me && me === campaign.ownerAddress) {
      const repo = getRepository()
      const overview = await overviewOf(repo, store, campaign)
      const invitations = await Promise.all(
        (await store.listInvitationsForCampaign(campaign.id)).map(async (invitation) => {
          const profile = await repo.getProfile(invitation.inviteeAddress)
          return { invitation, handle: profile.handle, displayName: profile.displayName }
        }),
      )
      return ok({ campaign, budget: overview.budget, viewer: 'OWNER', claims: overview.claims, invitations })
    }

    const myInvitation = me ? await store.findInvitation(campaign.id, me) : null
    return ok({
      campaign,
      budget: summariseBudget(campaign, taken, '0'),
      viewer: me ? 'JOBBER' : 'GUEST',
      // On a private campaign, the only way in is accepting your invitation.
      blocker: campaign.visibility === 'PRIVATE' && myInvitation?.status !== 'PENDING' && !mine ? 'NOT_OPEN' : blocker,
      myPactId: mine?.pactId ?? null,
      myInvitation: myInvitation && myInvitation.status !== 'REVOKED' ? myInvitation : null,
    })
  })
}

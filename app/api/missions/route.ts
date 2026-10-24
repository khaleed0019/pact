import { NextResponse } from 'next/server'
import { authed, body, fail, ok } from '@/lib/api/handler'
import { allow } from '@/lib/api/rateLimit'
import { missionDeps, missionsArePersistent } from '@/lib/missions'
import { createMission } from '@/lib/missions/service'
import { createMissionSchema } from '@/lib/missions/schema'
import { yoctoToNear } from '@/lib/near/amount'

export const dynamic = 'force-dynamic'

/** Your missions, plus what this deployment can actually do — so the UI never overstates it. */
export async function GET(): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const deps = missionDeps()
    const missions = await deps.store.listByOwner(session.address)
    return ok({
      missions,
      capabilities: {
        persistent: missionsArePersistent(),
        aiBackend: deps.aiBackend,
        network: deps.near.network,
        provider: {
          name: deps.provider.name,
          operator: deps.provider.operator,
          priceNear: yoctoToNear(deps.provider.priceYocto),
          payoutAccount: deps.provider.payoutAccount,
        },
      },
    })
  })
}

export async function POST(request: Request): Promise<NextResponse> {
  return authed(async ({ session }) => {
    // Planning may call a model; keep a runaway client from spending someone's quota.
    if (!allow(`mission-create:${session.address}`, 10, 60_000)) return fail('RATE_LIMITED', 429)
    const input = await body(request, createMissionSchema)
    const mission = await createMission(missionDeps(), session.address, input)
    return ok({ mission }, 201)
  })
}

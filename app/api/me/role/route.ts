import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getRepository } from '@/lib/db'
import { authed, body, ok } from '@/lib/api/handler'
import { APP_ROLES } from '@/lib/pact/roles'

export const dynamic = 'force-dynamic'

const roleSchema = z.object({ role: z.enum(APP_ROLES) })

/**
 * Choose, or switch, your product role.
 *
 * The address comes from the signed session, never from the body — a client can say which
 * role it wants, but not whose profile to put it on.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { role } = await body(request, roleSchema)
    await getRepository().setRole(session.address, role)
    return ok({ role })
  })
}

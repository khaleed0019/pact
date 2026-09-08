import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, ok } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Mark one reminder read.
 *
 * `markNotificationRead` is scoped to the caller's own address inside the repository, so
 * there is nothing here to authorise beyond "you're signed in" — a notification id from
 * someone else's inbox simply matches nothing and this is a harmless no-op.
 */
export async function PATCH(_request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    await getRepository().markNotificationRead(id, session.address)
    return ok({ read: true })
  })
}

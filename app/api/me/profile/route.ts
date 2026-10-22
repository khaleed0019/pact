import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, fail, guard, ok } from '@/lib/api/handler'
import { profileDetailsSchema } from '@/lib/api/schema'
import { HANDLE_PROBLEM_MESSAGE, handleProblem, normalizeHandle } from '@/lib/pact/handles'
import { readSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  return guard(async () => {
    const session = await readSession()
    if (!session) return fail('NOT_SIGNED_IN', 401)
    return ok({ profile: await getRepository().getProfile(session.address) })
  })
}

/**
 * Set your own handle, categories and links. The profile is the session's address — the
 * body cannot name anyone else's. A handle someone already uses is a 409.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const input = await body(request, profileDetailsSchema)
    let handle: string | null | undefined = input.handle
    if (typeof handle === 'string') {
      handle = handle.trim() === '' ? null : normalizeHandle(handle)
      const problem = handle ? handleProblem(handle) : null
      if (problem) return fail('VALIDATION', 422, HANDLE_PROBLEM_MESSAGE[problem])
    }
    const profile = await getRepository().updateProfileDetails(session.address, {
      handle,
      categories: input.categories,
      links: input.links,
    })
    return ok({ profile })
  })
}

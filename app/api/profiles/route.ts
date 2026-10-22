import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, fail, ok } from '@/lib/api/handler'
import { normalizeHandle } from '@/lib/pact/handles'

export const dynamic = 'force-dynamic'

/**
 * Find people by handle, for the invite picker. Signed-in only, prefix match only, and a
 * short list — enough to pick someone you already know the handle of, not a directory to
 * scrape. Returns the address beside each handle so the brand can see who they are inviting.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return authed(async () => {
    const q = normalizeHandle(new URL(request.url).searchParams.get('q') ?? '')
    if (!/^[a-z0-9_]{1,20}$/.test(q)) return fail('VALIDATION', 422, 'Type at least one letter of a handle.')
    const profiles = await getRepository().searchProfiles(q, 8)
    return ok({ profiles })
  })
}

import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/auth/session'
import { guard, ok } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

export async function POST(): Promise<NextResponse> {
  return guard(async () => {
    await destroySession()
    return ok({ signedOut: true })
  })
}

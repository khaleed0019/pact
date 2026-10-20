/**
 * Product roles: what someone came to PACT to do.
 *
 * A role is a product choice, not an identity claim. Identity is the wallet signature
 * behind the session; the role only decides which dashboard you land on and which
 * campaign actions the server will accept from you. It is stored against the verified
 * address, never taken from the request as proof of anything.
 *
 * One active role at a time, switchable from the profile. Switching never touches an
 * agreement already made: a pact's CLIENT and PROVIDER are fixed on the pact itself, so
 * a brand who later works as a contributor keeps paying what they agreed to pay.
 */

export const APP_ROLES = ['BRAND', 'CONTRIBUTOR'] as const
export type AppRole = (typeof APP_ROLES)[number]

export const ROLE_META: Record<AppRole, { label: string; pitch: string; does: string[] }> = {
  BRAND: {
    label: 'Brand',
    pitch: 'I want to publish campaigns and pay contributors.',
    does: ['Post paid work with clear requirements', 'Review what people submit', 'Pay from your wallet once approved'],
  },
  CONTRIBUTOR: {
    label: 'Contributor',
    pitch: 'I want to find work, complete tasks, and get paid.',
    does: ['Browse paid work from brands', 'Sign an agreement before you start', 'Get paid in NIM or USDT when approved'],
  },
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value)
}

/** Which campaign actions need which role. Checked on the server, in the route. */
export const ROLE_REQUIRED = {
  postCampaign: 'BRAND',
  claimCampaign: 'CONTRIBUTOR',
} as const satisfies Record<string, AppRole>

export function roleBlockMessage(needed: AppRole): string {
  return needed === 'BRAND'
    ? 'Posting work is for brands. Switch to Brand in your profile to post a campaign.'
    : 'Taking up work is for contributors. Switch to Contributor in your profile to take this up.'
}

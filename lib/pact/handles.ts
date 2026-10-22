/**
 * Pact handles: `@name`, a way to find someone to invite.
 *
 * A handle is only ever set by the signed-in wallet that owns the profile, so resolving
 * `@name` gives the address that chose it. It is a lookup, not proof of who a person is
 * in the outside world — the UI shows the address beside it, and an invitation is bound
 * to that address, not to the name.
 *
 * Rules mirror the database check (`^[a-z][a-z0-9_]{2,19}$`): lowercase, starts with a
 * letter, 3–20 characters of letters, digits and underscores.
 */

export const HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,19}$/

/** Names that would read as the app, its staff or its operators. */
const RESERVED = new Set([
  'pact',
  'pactapp',
  'admin',
  'administrator',
  'support',
  'help',
  'team',
  'staff',
  'mod',
  'moderator',
  'official',
  'nimiq',
  'nimiqpay',
  'system',
  'root',
  'security',
  'verify',
  'verified',
  'brand',
  'contributor',
  'null',
  'undefined',
  'me',
  'you',
])

/** `@Name ` → `name`. Does not validate. */
export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, '').toLowerCase()
}

export type HandleProblem = 'FORMAT' | 'RESERVED'

export function handleProblem(input: string): HandleProblem | null {
  const handle = normalizeHandle(input)
  if (!HANDLE_PATTERN.test(handle)) return 'FORMAT'
  if (RESERVED.has(handle) || handle.startsWith('pact_') || handle.startsWith('nimiq_')) return 'RESERVED'
  return null
}

export const HANDLE_PROBLEM_MESSAGE: Record<HandleProblem, string> = {
  FORMAT: 'Use 3–20 lowercase letters, numbers or underscores, starting with a letter.',
  RESERVED: 'That name is reserved. Pick another.',
}

export interface PublicProfile {
  address: string
  handle: string | null
  displayName: string
  categories: string[]
  links: string[]
}

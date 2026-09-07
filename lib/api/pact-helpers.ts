import 'server-only'
import { RepoError, getRepository } from '../db/index.ts'
import { normalizeAddress } from '../nimiq/address.ts'
import type { PactDetail, ParticipantRole } from '../pact/types.ts'

/**
 * Shared lookups for the pact routes.
 *
 * Centralising "load this pact and work out who is asking" means every route gets the
 * same answer, and none of them can accidentally skip the membership check.
 */

export interface Viewer {
  address: string
  role: ParticipantRole
  displayName: string
}

export async function loadPact(id: string): Promise<PactDetail> {
  const pact = await getRepository().getPactById(id)
  if (!pact) throw new RepoError('NOT_FOUND', 'That agreement does not exist.')
  return pact
}

/** Resolve the caller's role from stored participants. Throws if they are not a party. */
export function viewerOf(pact: PactDetail, address: string): Viewer {
  const wanted = normalizeAddress(address)
  const participant = pact.participants.find((p) => p.address && normalizeAddress(p.address) === wanted)
  if (!participant) throw new RepoError('NOT_ALLOWED', 'You are not a party to this agreement.')
  return { address: wanted, role: participant.role, displayName: participant.displayName }
}

export function counterpartOf(pact: PactDetail, role: ParticipantRole) {
  return pact.participants.find((p) => p.role !== role) ?? null
}

/** Both signatures present means the terms are locked and work can begin. */
export function isFullySealed(pact: PactDetail): boolean {
  return pact.participants.length > 0 && pact.participants.every((p) => p.sealSignature !== null)
}

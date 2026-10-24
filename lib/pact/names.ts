import { shortenAddress } from '../nimiq/address.ts'

/**
 * The name a party appears under on an agreement.
 *
 * A name is stored on the agreement and shown to the *other* side, so a pronoun is never
 * acceptable: "You" or "Me" reads correctly to the person who typed it and wrongly to
 * everyone else ("Paid to You" on the payer's screen). Placeholders are replaced with the
 * person's saved profile name, or failing that their shortened wallet address — which is
 * at least true for whoever reads it.
 */
const PLACEHOLDERS = new Set(['you', 'me', 'myself', 'i', 'yourself', 'someone', 'unnamed'])

export function isPlaceholderName(name: string | null | undefined): boolean {
  const trimmed = (name ?? '').trim().toLowerCase()
  return trimmed === '' || PLACEHOLDERS.has(trimmed)
}

export function resolvePartyName(requested: string | null | undefined, savedName: string | null | undefined, address: string): string {
  if (!isPlaceholderName(requested)) return requested!.trim().slice(0, 80)
  if (!isPlaceholderName(savedName)) return savedName!.trim().slice(0, 80)
  return shortenAddress(address)
}

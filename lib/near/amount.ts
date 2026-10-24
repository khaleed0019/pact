/**
 * NEAR amounts.
 *
 * 1 NEAR = 10^24 yoctoNEAR. Like every other amount in PACT, NEAR is stored and compared
 * as a minor-unit (yocto) decimal string and never as a float — a float cannot even
 * represent one yoctoNEAR next to a whole NEAR.
 */

export const NEAR_DECIMALS = 24

export class NearAmountError extends Error {}

/** Missions are small, bounded jobs; a budget input is capped so a typo cannot ask for 10^9 NEAR. */
export const MAX_NEAR_INPUT_DECIMALS = 6

/** "1.5" -> "1500000000000000000000000". Rejects anything a user could fat-finger. */
export function nearToYocto(input: string): string {
  const raw = input.trim().replace(/,/g, '')
  if (raw === '') throw new NearAmountError('Enter an amount.')
  if (!/^\d*\.?\d*$/.test(raw)) throw new NearAmountError('Amounts can only contain digits and one decimal point.')

  const [whole = '0', fraction = ''] = raw.split('.')
  if (fraction.length > MAX_NEAR_INPUT_DECIMALS) {
    throw new NearAmountError(`Use at most ${MAX_NEAR_INPUT_DECIMALS} decimal places.`)
  }
  const yocto = `${whole}${fraction.padEnd(NEAR_DECIMALS, '0')}`.replace(/^0+(?=\d)/, '')
  if (/^0+$/.test(yocto)) throw new NearAmountError('Amount must be greater than zero.')
  return yocto
}

/** "1500000000000000000000000" -> "1.5". Exact; trailing zeros trimmed. */
export function yoctoToNear(yocto: string): string {
  const padded = yocto.padStart(NEAR_DECIMALS + 1, '0')
  const whole = padded.slice(0, padded.length - NEAR_DECIMALS)
  const fraction = padded.slice(padded.length - NEAR_DECIMALS).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}

export function formatNear(yocto: string): string {
  return `${yoctoToNear(yocto)} NEAR`
}

/** Compare two yocto strings without losing precision. */
export function compareYocto(a: string, b: string): -1 | 0 | 1 {
  const x = BigInt(a)
  const y = BigInt(b)
  return x === y ? 0 : x < y ? -1 : 1
}

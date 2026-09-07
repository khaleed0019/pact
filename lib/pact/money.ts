import { DECIMALS, type Currency } from './types.ts'

/**
 * Money handling.
 *
 * Everything is stored and moved as a **minor-unit string** (Luna for NIM, 1e-6 for
 * USDT). Floats never touch an amount that will be sent to a wallet: `0.1 + 0.2` is a
 * funny bug in a todo app and a support ticket in a payments app.
 */

export class AmountError extends Error {}

/** "12.50" -> "12500000" for USDT (6dp). Rejects anything a user could fat-finger. */
export function toMinor(input: string | number, currency: Currency): string {
  const decimals = DECIMALS[currency]
  const raw = String(input).trim().replace(/,/g, '')

  if (raw === '') throw new AmountError('Enter an amount.')
  if (!/^\d*\.?\d*$/.test(raw)) throw new AmountError('Amounts can only contain digits and one decimal point.')

  const [whole = '0', fraction = ''] = raw.split('.')
  if (fraction.length > decimals) {
    throw new AmountError(`${currency} supports at most ${decimals} decimal places.`)
  }

  const minor = `${whole}${fraction.padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, '')
  if (minor === '' || /^0+$/.test(minor)) throw new AmountError('Amount must be greater than zero.')
  return minor
}

/** "12500000" -> "12.5" for USDT. Trailing zeros are trimmed; the value is exact. */
export function fromMinor(minor: string, currency: Currency): string {
  const decimals = DECIMALS[currency]
  const padded = minor.padStart(decimals + 1, '0')
  const whole = padded.slice(0, padded.length - decimals)
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}

/** Grouped for display: "1234500000" USDT -> "1,234.5". */
export function formatAmount(minor: string, currency: Currency): string {
  const plain = fromMinor(minor, currency)
  const [whole, fraction] = plain.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction ? `${grouped}.${fraction}` : grouped
}

export function formatWithCurrency(minor: string, currency: Currency): string {
  return `${formatAmount(minor, currency)} ${currency}`
}

export function addMinor(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString()
}

export function sumMinor(values: string[]): string {
  return values.reduce((acc, v) => (BigInt(acc) + BigInt(v)).toString(), '0')
}

/**
 * Split a total into milestone amounts by percentage, giving any rounding remainder to
 * the final milestone. The parts always add back up to exactly the total — a client who
 * pays every milestone has paid the agreed amount to the minor unit.
 */
export function splitByPercent(totalMinor: string, percents: number[]): string[] {
  const total = BigInt(totalMinor)
  const parts = percents.map((p) => (total * BigInt(Math.round(p * 100))) / 10000n)
  const distributed = parts.reduce((a, b) => a + b, 0n)
  const remainder = total - distributed
  if (parts.length > 0) parts[parts.length - 1] += remainder
  return parts.map((p) => p.toString())
}

/**
 * NIM value for `sendBasicTransaction` is a **number of Luna**, not a string.
 * Luna are 1e5, so any realistic pact amount is far inside Number.MAX_SAFE_INTEGER —
 * but we check rather than assume, because a silent precision loss here sends the
 * wrong amount of real money.
 */
export function minorToLunaNumber(minor: string): number {
  const value = BigInt(minor)
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AmountError('That amount is too large to send in a single transaction.')
  }
  return Number(value)
}

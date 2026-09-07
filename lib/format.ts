/**
 * Human-facing date and time formatting.
 *
 * Deadlines are the thing people scan for, so they are phrased the way a person would
 * say them out loud — "in 3 days", "tomorrow", "6 days ago" — rather than as a date the
 * reader has to subtract from today in their head.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days between two dates, comparing calendar days rather than exact instants. */
export function daysUntil(iso: string, from: Date = new Date()): number {
  const target = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  )
  const today = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  return Math.round((target - today) / DAY_MS)
}

export function formatDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function formatLongDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** "in 3 days" / "tomorrow" / "6 days overdue". Used everywhere a deadline appears. */
export function relativeDeadline(iso: string, from: Date = new Date()): { label: string; overdue: boolean; soon: boolean } {
  const days = daysUntil(iso, from)
  if (days < 0) {
    const n = Math.abs(days)
    return { label: n === 1 ? '1 day overdue' : `${n} days overdue`, overdue: true, soon: false }
  }
  if (days === 0) return { label: 'due today', overdue: false, soon: true }
  if (days === 1) return { label: 'due tomorrow', overdue: false, soon: true }
  if (days <= 7) return { label: `due in ${days} days`, overdue: false, soon: true }
  return { label: `due ${formatDate(iso)}`, overdue: false, soon: false }
}

/** Timestamps on the timeline: "just now", "4h ago", then an absolute date. */
export function relativeTime(isoTimestamp: string, from: Date = new Date()): string {
  const elapsed = from.getTime() - new Date(isoTimestamp).getTime()
  const minutes = Math.floor(elapsed / 60000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return formatDate(isoTimestamp.slice(0, 10))
}

export function greeting(now: Date = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Sentence-case a list: "Khaleed, John and Amara". */
export function joinNames(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

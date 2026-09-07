import type { Ambiguity, Explanation, Extraction, Review } from './schema.ts'
import { formatWithCurrency } from '../pact/money.ts'
import type { Currency } from '../pact/types.ts'

/**
 * The built-in reader.
 *
 * PACT's Pact Builder must work with no API key configured — a judge cloning the repo,
 * or a user on a day the AI service is down, still needs to be able to create an
 * agreement. This module does the same job deterministically: pull the amount, currency,
 * dates, parties and payment split out of a sentence with ordinary parsing, and flag the
 * same categories of ambiguity with a checklist rather than a model.
 *
 * It is honest about what it is. Anything it produces is labelled `heuristic` in the API
 * response and the UI says so, so nobody is told a regex is an AI.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Find a deadline. Handles the three ways people actually write one: an explicit date,
 * a month-and-day, and a relative duration. A bare "September 15" with no year is read
 * as the next occurrence, because nobody schedules work into the past.
 */
export function parseDeadline(input: string, today = new Date()): string | null {
  const text = input.toLowerCase()

  const explicit = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (explicit) return `${explicit[1]}-${explicit[2]}-${explicit[3]}`

  const dayFirst = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})\b/)
  const monthFirst = text.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b/)

  for (const [match, monthIndex, dayIndex] of [
    [monthFirst, 1, 2],
    [dayFirst, 2, 1],
  ] as const) {
    if (!match) continue
    const month = MONTHS[match[monthIndex]]
    const day = Number(match[dayIndex])
    if (!month || day < 1 || day > 31) continue

    let year = today.getUTCFullYear()
    const candidate = Date.UTC(year, month - 1, day)
    if (candidate < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) year += 1
    return iso(year, month, day)
  }

  /*
   * "by the 20th" — a day with no month at all. Extremely common in the way people
   * actually agree things, and meaningless unless you resolve it: it means the next
   * time that date comes round, this month if it is still ahead, otherwise next month.
   */
  const bareDay = text.match(/\b(?:by|on|before|due)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/)
  if (bareDay) {
    const day = Number(bareDay[1])
    if (day >= 1 && day <= 31) {
      const year = today.getUTCFullYear()
      const month = today.getUTCMonth()
      const thisMonth = Date.UTC(year, month, day)
      const startOfToday = Date.UTC(year, month, today.getUTCDate())
      const target = thisMonth >= startOfToday ? new Date(thisMonth) : new Date(Date.UTC(year, month + 1, day))
      return target.toISOString().slice(0, 10)
    }
  }

  const relative = text.match(/\bin\s+(\d{1,3})\s+(day|days|week|weeks|month|months)\b/)
  if (relative) {
    const amount = Number(relative[1])
    const unit = relative[2]
    const days = unit.startsWith('day') ? amount : unit.startsWith('week') ? amount * 7 : amount * 30
    const target = new Date(today)
    target.setUTCDate(target.getUTCDate() + days)
    return target.toISOString().slice(0, 10)
  }

  if (/\btomorrow\b/.test(text)) {
    const target = new Date(today)
    target.setUTCDate(target.getUTCDate() + 1)
    return target.toISOString().slice(0, 10)
  }
  if (/\bnext week\b/.test(text)) {
    const target = new Date(today)
    target.setUTCDate(target.getUTCDate() + 7)
    return target.toISOString().slice(0, 10)
  }
  if (/\bend of (?:the )?month\b/.test(text)) {
    const target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
    return target.toISOString().slice(0, 10)
  }

  return null
}

export function parseAmount(input: string): { amount: string; currency: Currency } | null {
  const text = input.replace(/,/g, '')

  // "200 USDT", "200USDT", "USDT 200", "$200", "200 dollars", "850 NIM"
  const patterns: Array<[RegExp, Currency]> = [
    [/(\d+(?:\.\d+)?)\s*(?:usdt|usd|dollars?|\$)/i, 'USDT'],
    [/(?:usdt|usd|\$)\s*(\d+(?:\.\d+)?)/i, 'USDT'],
    [/(\d+(?:\.\d+)?)\s*nim\b/i, 'NIM'],
    [/\bnim\s*(\d+(?:\.\d+)?)/i, 'NIM'],
  ]

  for (const [pattern, currency] of patterns) {
    const match = text.match(pattern)
    if (match) return { amount: match[1], currency }
  }
  return null
}

/**
 * Pull a payment split out of phrases like "50% upfront" or "half now, half on delivery".
 * Returns percentages that sum to 100, or an empty array when nothing is stated.
 */
export function parseSplit(input: string): number[] {
  const text = input.toLowerCase()

  const percentages = [...text.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number(m[1])).filter((n) => n > 0 && n <= 100)
  if (percentages.length >= 2 && percentages.reduce((a, b) => a + b, 0) === 100) return percentages
  if (percentages.length === 1 && percentages[0] < 100) return [percentages[0], 100 - percentages[0]]

  if (/\bhalf\b.*\b(?:half|rest|remainder|balance)\b/.test(text)) return [50, 50]
  if (/\b(?:third|thirds)\b/.test(text)) return [33.33, 33.33, 33.34]
  return []
}

function parseParties(input: string): { client: string; provider: string; authorRole: 'CLIENT' | 'PROVIDER' } {
  // "hire John", "pay Amara", "work with Sam" -> the other party is named.
  const named = input.match(/\b(?:hire|pay|paying|hiring|work with|working with|commission)\s+([A-Z][\w'-]{1,30})/)
  if (named) return { client: 'You', provider: named[1], authorRole: 'CLIENT' }

  // "I need a video editor", "looking for a designer" -> a role, not a name.
  const role = input.match(/\b(?:need|want|looking for|find)\s+(?:an?\s+)?([a-z][a-z\s]{2,30}?)(?:\s+to\b|\s+for\b|\s+who\b|[.,]|$)/i)
  if (role) {
    const title = role[1].trim().replace(/\s+/g, ' ')
    return { client: 'You', provider: title.charAt(0).toUpperCase() + title.slice(1), authorRole: 'CLIENT' }
  }

  // "I will design", "I'll deliver" -> the author is doing the work.
  if (/\bi(?:'|’)?(?:ll| will| am going to| can)\s+(?:design|build|write|edit|deliver|make|create|develop)/i.test(input)) {
    return { client: 'Client', provider: 'You', authorRole: 'PROVIDER' }
  }

  return { client: 'You', provider: 'Other party', authorRole: 'CLIENT' }
}

function titleFrom(input: string): string {
  const cleaned = input.replace(/\s+/g, ' ').trim()
  const verb = cleaned.match(
    /\b(design|build|develop|write|edit|record|translate|illustrate|photograph|fix|migrate|audit)\b[^.,;]{0,60}/i,
  )
  const candidate = verb ? verb[0] : cleaned.split(/[.,;]/)[0]
  const trimmed = candidate.trim().slice(0, 80)
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** Words that reliably signal an agreement someone will later argue about. */
const VAGUE_TERMS = [
  'several', 'some', 'a few', 'a couple', 'etc', 'and so on', 'various', 'multiple',
  'asap', 'soon', 'quickly', 'later', 'a bit', 'roughly', 'around', 'or so', 'stuff', 'things',
]

export function findAmbiguities(input: {
  deliverable: string
  amount: string
  deadline: string | null
  paymentCondition: string
  milestones: unknown[]
}): Ambiguity[] {
  const found: Ambiguity[] = []
  const haystack = input.deliverable.toLowerCase()

  const vague = VAGUE_TERMS.filter((term) => new RegExp(`\\b${term}\\b`).test(haystack))
  if (vague.length > 0) {
    found.push({
      field: 'deliverable',
      issue: `"${vague[0]}" is open to interpretation. Two people can read it and picture different amounts of work.`,
      suggestion: 'Replace it with an exact number or a specific list.',
      severity: 'high',
    })
  }

  // A countable noun with no count is the single most common source of scope disputes.
  const countable = haystack.match(/\b(videos|pages|articles|posts|logos|designs|photos|images|screens|revisions)\b/)
  if (countable && !/\b\d+\s+\w*\s*\b/.test(haystack.slice(Math.max(0, haystack.indexOf(countable[1]) - 24)))) {
    found.push({
      field: 'deliverable',
      issue: `You mention ${countable[1]} but not how many.`,
      suggestion: `State the exact number of ${countable[1]}.`,
      severity: 'high',
    })
  }

  if (!input.deadline) {
    found.push({
      field: 'deadline',
      issue: 'There is no deadline, so neither side can say whether the work is late.',
      suggestion: 'Pick a date, even a rough one you can both revise later.',
      severity: 'high',
    })
  }

  if (!input.amount) {
    found.push({
      field: 'amount',
      issue: 'No amount was found in your description.',
      suggestion: 'State what the work is worth and in which currency.',
      severity: 'high',
    })
  }

  if (!input.paymentCondition.trim()) {
    found.push({
      field: 'paymentCondition',
      issue: 'It is not clear when payment happens.',
      suggestion: 'Say whether payment comes upfront, on delivery, or after approval.',
      severity: 'medium',
    })
  }

  if (/\brevision|change|feedback\b/.test(haystack) && !/\b\d+\s+(?:round|revision)/.test(haystack)) {
    found.push({
      field: 'deliverable',
      issue: 'Revisions are mentioned but not limited, so there is no agreed stopping point.',
      suggestion: 'Cap it, for example "two rounds of revisions included".',
      severity: 'medium',
    })
  }

  if (input.milestones.length === 0 && input.amount) {
    found.push({
      field: 'milestones',
      issue: 'The whole amount is a single payment at the end.',
      suggestion: 'Splitting it into milestones reduces how much either side is exposed at once.',
      severity: 'low',
    })
  }

  return found.slice(0, 6)
}

/** Turn a free-text description into a draft agreement, deterministically. */
export function heuristicExtract(description: string, creatorName: string, today = new Date()): Extraction {
  const money = parseAmount(description)
  const deadline = parseDeadline(description, today)
  const parties = parseParties(description)
  const split = parseSplit(description)

  /*
   * Order matters here.
   *
   * "50% upfront, the rest after I approve" contains the word "upfront", but describing
   * that agreement as "Upfront" is simply wrong — the split is the condition. So a
   * detected split wins over any single phrase, and only then do the individual phrases
   * get a look. Approval is checked before delivery because "pay on delivery once I've
   * approved it" means approval, not delivery.
   */
  // Covers "after final approval", "once approved", and the far commoner conversational
  // forms — "once I approve it", "when you approve", "after they approve".
  const approvalPhrase =
    /after (?:final )?approval|on approval|once approved|(?:after|once|when)\s+(?:i|we|they|you)\s+(?:have\s+)?approve/i
  const deliveryPhrase = /on delivery|when (?:it is|its|it's) delivered|upon delivery/i
  const upfrontPhrase = /upfront|in advance|before starting|before (?:you|they) start/i

  const condition =
    split.length > 0
      ? 'Split across milestones'
      : approvalPhrase.test(description)
        ? 'After final approval'
        : deliveryPhrase.test(description)
          ? 'On delivery'
          : upfrontPhrase.test(description)
            ? 'Upfront'
            : ''

  const milestones =
    split.length > 0
      ? split.map((percent, index) => ({
          title: index === 0 ? 'Project start' : index === split.length - 1 ? 'Final delivery' : `Stage ${index + 1}`,
          description: '',
          percent,
          dueDate: index === split.length - 1 ? deadline : null,
        }))
      : []

  return {
    title: titleFrom(description),
    deliverable: description.replace(/\s+/g, ' ').trim().slice(0, 2000),
    clientName: parties.authorRole === 'CLIENT' ? creatorName || parties.client : parties.client,
    providerName: parties.authorRole === 'PROVIDER' ? creatorName || parties.provider : parties.provider,
    authorRole: parties.authorRole,
    amount: money?.amount ?? '',
    currency: money?.currency ?? 'USDT',
    deadline,
    paymentCondition: condition,
    specialTerms: [],
    milestones,
    ambiguities: findAmbiguities({
      deliverable: description,
      amount: money?.amount ?? '',
      deadline,
      paymentCondition: condition,
      milestones,
    }),
    // Deliberately modest: this is pattern matching, and the user should check it.
    confidence: money && deadline ? 0.6 : 0.35,
  }
}

export function heuristicReview(input: {
  deliverable: string
  amount: string
  deadline: string | null
  paymentCondition: string
  milestones: unknown[]
}): Review {
  const ambiguities = findAmbiguities(input)
  const high = ambiguities.filter((a) => a.severity === 'high').length
  return {
    ambiguities,
    verdict:
      high > 0
        ? `${high} thing${high === 1 ? '' : 's'} here could be read two ways. Worth fixing before you send it.`
        : ambiguities.length > 0
          ? 'The essentials are covered. A couple of details could be tighter.'
          : 'This reads clearly. Both sides should know exactly what was agreed.',
  }
}

export function heuristicExplain(input: {
  title: string
  deliverable: string
  currency: Currency
  totalAmountMinor: string
  deadline: string | null
  paymentCondition: string
  specialTerms: string[]
  viewerRole: 'CLIENT' | 'PROVIDER'
  milestones: Array<{ title: string; amountMinor: string; dueDate: string | null }>
}): Explanation {
  const money = formatWithCurrency(input.totalAmountMinor, input.currency)
  const isClient = input.viewerRole === 'CLIENT'

  const dates = [
    input.deadline ? `Everything is due by ${input.deadline}.` : 'No overall deadline has been set.',
    ...input.milestones.filter((m) => m.dueDate).map((m) => `${m.title} is due ${m.dueDate}.`),
  ]

  return {
    whatYouAgreeTo: `${input.title}: ${input.deliverable} The agreed value is ${money}.`,
    whatYouMustDo: isClient
      ? [
          `Pay ${money}${input.paymentCondition ? ` — ${input.paymentCondition.toLowerCase()}` : ''}.`,
          'Review what is delivered and either approve it or say what needs changing.',
        ]
      : ['Deliver the work described above.', 'Submit it through PACT so there is a record of when you delivered.'],
    whatTheyMustDo: isClient
      ? ['Deliver the work described above.', 'Submit it through PACT so the delivery is recorded.']
      : [`Pay ${money}${input.paymentCondition ? ` — ${input.paymentCondition.toLowerCase()}` : ''}.`, 'Review and approve the delivery.'],
    importantDates: dates,
    paymentTerms: input.paymentCondition
      ? `${money}, ${input.paymentCondition.toLowerCase()}. Payments go directly from one wallet to the other — PACT records them, it does not hold them.`
      : `${money}. No payment timing was agreed, which is worth settling before work starts. Payments go directly wallet to wallet.`,
    risks: [
      ...(input.deadline ? [] : ['No deadline is set, so "late" cannot be measured.']),
      ...(input.paymentCondition ? [] : ['Payment timing is unstated.']),
      ...(input.milestones.length === 0
        ? ['The full amount rests on a single payment, so one side carries the whole risk at once.']
        : []),
      'PACT does not hold funds. Paying early means trusting the other side to deliver.',
    ].slice(0, 5),
  }
}

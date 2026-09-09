import type { ParticipantRole } from './types.ts'

/**
 * What kind of agreement this is.
 *
 * The category is not a label. It decides three things the rest of the app reads:
 * whether money is part of the agreement at all, what the two sides are called, and what
 * the builder asks for. "Paying" and "Delivering" are exactly right for a freelance job
 * and exactly wrong for two friends holding each other to a running schedule.
 *
 * ## Why this is not in the terms digest
 *
 * Everything material about an agreement should be covered by the signature, and the
 * category is material — it changes whether money is involved at all. It is left out of
 * `CanonicalTerms` anyway because it is set once at creation and there is no code path
 * that mutates it: not `updateTerms`, not the schema, not any route. So there is nothing
 * for a signature to protect it against, and folding it in would change the digest of
 * every pact already signed, clearing signatures on the next term edit for no benefit.
 * If a "change category" action is ever added, this decision has to be revisited first.
 *
 * ## On the group challenge that isn't here
 *
 * The schema enforces one CLIENT and one PROVIDER per pact (`one_role_per_pact`), and
 * the terms digest — the thing both parties sign — is computed over exactly two
 * participants. A group agreement is a genuinely different object, not a category flag,
 * and shipping a two-person pact labelled "group" would be a lie told in the UI to avoid
 * doing the modelling. Left out on purpose.
 */

export const PACT_CATEGORIES = ['FREELANCE', 'PAYMENT', 'COMMITMENT', 'CHALLENGE'] as const
export type PactCategory = (typeof PACT_CATEGORIES)[number]

export interface CategoryMeta {
  label: string
  /** One line, shown under the label when picking. Says who this is for. */
  blurb: string
  /**
   * Whether an amount is part of this kind of agreement.
   *
   * When false the builder skips the money step entirely and the pact is stored with a
   * zero total, which the payment surfaces treat as "there is nothing to pay here"
   * rather than as "pay zero".
   */
  usesPayment: boolean
  /**
   * What each side is called, in both grammatical persons.
   *
   * `label` sits under a name in the participants list ("Committing"); `self` is the
   * whole phrase on your own card ("You're committing"). Two fields rather than one
   * prefixed at the call site, because "You're " + "Holding them to it" is not English.
   */
  roles: Record<ParticipantRole, { label: string; self: string }>
  /** Placeholder for the builder's free-text box, in the shape of that category. */
  placeholder: string
  /** Tappable starting points. Money examples in a money-free flow are just confusing. */
  examples: string[]
  /** The hint under the box. "How much" is wrong when there is no amount. */
  hint: string
}

export const CATEGORY_META: Record<PactCategory, CategoryMeta> = {
  FREELANCE: {
    label: 'Freelance work',
    blurb: 'Someone does the work, someone pays for it.',
    usesPayment: true,
    roles: {
      CLIENT: { label: 'Paying', self: 'You’re paying' },
      PROVIDER: { label: 'Delivering', self: 'You’re delivering' },
    },
    placeholder: 'I’m paying Amara 150 USDT to edit 10 short videos, done by the 22nd, half up front.',
    hint: 'Include what, how much, and by when.',
    examples: [
      'I want to hire John to design my website for 800 NIM. He should deliver by September 20 and I’ll pay after I approve the final design.',
      'I need a video editor to edit 10 videos for 150 USDT by the 20th. Half upfront, half on delivery.',
      'Selling my preset pack for 850 NIM, delivered as a download link once paid.',
    ],
  },
  PAYMENT: {
    label: 'Money between people',
    blurb: 'A loan, a split bill, or paying someone back over time.',
    usesPayment: true,
    roles: {
      CLIENT: { label: 'Paying', self: 'You’re paying' },
      PROVIDER: { label: 'Receiving', self: 'You’re being paid' },
    },
    placeholder: 'I’m paying John back 800 NIM for the flight, 400 now and 400 by the end of the month.',
    hint: 'Include how much, to whom, and by when.',
    examples: [
      'I’m paying Sam back 500 NIM for the concert tickets, half this week and half on the 30th.',
      'Lending Amara 200 USDT, to be paid back in full by the end of next month.',
      'Splitting the 900 NIM deposit with John — I’ve paid it, he owes me 450 by Friday.',
    ],
  },
  COMMITMENT: {
    label: 'A commitment',
    blurb: 'You promise someone you’ll do something, and they hold you to it.',
    usesPayment: false,
    roles: {
      // The person making the promise "delivers" it, so they sit in the PROVIDER slot and
      // the person holding them to it takes the other side.
      CLIENT: { label: 'Holding them to it', self: 'You’re holding them to it' },
      PROVIDER: { label: 'Committing', self: 'You’re committing' },
    },
    placeholder: 'I’ll have the first draft of my portfolio site finished and sent to Sam by the 30th.',
    hint: 'Include what you’ll do, who’s holding you to it, and by when.',
    examples: [
      'I’ll have the first draft of my portfolio site finished and sent to Sam by the 30th.',
      'I’m submitting my thesis chapter to my supervisor by the 15th, no extensions.',
      'I’ll publish one written piece a week for the next month, and Amara checks on Sundays.',
    ],
  },
  CHALLENGE: {
    label: 'A challenge',
    blurb: 'Two people, one target, and a record of who actually did it.',
    usesPayment: false,
    roles: {
      CLIENT: { label: 'Keeping score', self: 'You’re keeping score' },
      PROVIDER: { label: 'Taking it on', self: 'You’re taking it on' },
    },
    placeholder: 'I’m running 5km every weekday for the next month and Sam is checking in on Fridays.',
    hint: 'Include the target, who’s keeping score, and how long it runs.',
    examples: [
      'I’m running 5km every weekday for the next month and Sam is checking in on Fridays.',
      'Thirty days of shipping code every day. John verifies the commits at the end.',
      'No takeaway for six weeks. Amara is keeping score and we settle up on the 12th.',
    ],
  },
}

/**
 * Look up metadata for a category that might not be one.
 *
 * Every accessor goes through here rather than indexing `CATEGORY_META` directly, because
 * the alternative is a `TypeError` on `.roles` that takes down whichever screen touched
 * it — and the screen that touches every pact at once is the list. A row written before
 * this column existed, or by a newer deploy that knows a category this build doesn't,
 * should render as an ordinary agreement, not as a blank page.
 *
 * FREELANCE is the fallback because it is what every pact was before categories existed,
 * so an unlabelled row is far more likely to be one of those than anything else.
 */
export function categoryMeta(category: PactCategory): CategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META.FREELANCE
}

/** True when this agreement involves money at all. */
export function usesPayment(category: PactCategory): boolean {
  return categoryMeta(category).usesPayment
}

/** What to call a side of this agreement. Never hardcode "Paying"/"Delivering" again. */
export function roleLabel(category: PactCategory, role: ParticipantRole): string {
  return categoryMeta(category).roles[role].label
}

/** The same, addressed to the person themselves. */
export function roleSelfLabel(category: PactCategory, role: ParticipantRole): string {
  return categoryMeta(category).roles[role].self
}

import { z } from 'zod'
import { CURRENCIES, DISPUTE_REASONS, EVM_CHAINS, PACT_STATUSES, PACT_VISIBILITIES } from '../pact/types.ts'
import { PACT_CATEGORIES, usesPayment } from '../pact/categories.ts'
import { isValidAddress } from '../nimiq/address.ts'

/**
 * Request validation.
 *
 * Every field a client can send is bounded here — length, shape and range — before it
 * reaches the repository. Two things this catches that are easy to miss: text fields with
 * no maximum length (a 10MB "title" is a denial-of-service), and links with a
 * non-http scheme (`javascript:` in a deliverable link would be a stored XSS the moment
 * something renders it as an anchor).
 */

const text = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max).optional().default('')

/** Minor units, as a decimal string. Never a number — floats lose precision. */
export const minorAmount = z
  .string()
  .regex(/^\d{1,30}$/, 'Amount must be a whole number of minor units.')
  .refine((value) => BigInt(value) > 0n, 'Amount must be greater than zero.')

/**
 * Same shape, but zero is allowed.
 *
 * Only the pact total uses this. A payment or a milestone of zero is meaningless and
 * stays rejected; a pact total of zero is how a commitment or a challenge says "there is
 * no money in this agreement".
 */
export const minorAmountOrZero = z
  .string()
  .regex(/^\d{1,30}$/, 'Amount must be a whole number of minor units.')

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'That date does not exist.')

export const nimiqAddress = z.string().refine(isValidAddress, 'That is not a valid Nimiq address.')

/** Only http(s). Blocks `javascript:` and `data:` links before they can ever be rendered. */
export const externalLink = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol)
    } catch {
      return false
    }
  }, 'Links must start with http:// or https://')

export const milestoneInput = z.object({
  title: text(120),
  description: optionalText(500),
  amountMinor: minorAmount,
  percent: z.number().min(0).max(100),
  dueDate: isoDate.nullable().default(null),
})

export const createPactSchema = z
  .object({
    category: z.enum(PACT_CATEGORIES).default('FREELANCE'),
    title: text(140),
    deliverable: text(2000),
    creatorRole: z.enum(['CLIENT', 'PROVIDER']),
    creatorName: text(80),
    counterpartyName: text(80),
    counterpartyAddress: nimiqAddress.nullable().default(null),
    currency: z.enum(CURRENCIES),
    chain: z.enum(Object.keys(EVM_CHAINS) as [string, ...string[]]).nullable().default(null),
    totalAmountMinor: minorAmountOrZero,
    deadline: isoDate.nullable().default(null),
    paymentCondition: optionalText(300),
    specialTerms: z.array(text(300)).max(12).default([]),
    milestones: z.array(milestoneInput).max(12).default([]),
  })
  // A USDT pact settles on a specific chain; a NIM pact settles on Nimiq. Letting these
  // disagree would produce a payment screen that cannot describe where the money goes.
  .refine((value) => (value.currency === 'USDT' ? value.chain !== null : value.chain === null), {
    message: 'USDT agreements need a network, and NIM agreements must not have one.',
    path: ['chain'],
  })
  // The category decides whether money is part of this at all, and the two must agree:
  // a freelance job for nothing is a mistake, and a commitment for 50 NIM is a payment
  // agreement wearing the wrong label.
  .refine(
    (value) => (usesPayment(value.category) ? BigInt(value.totalAmountMinor) > 0n : value.totalAmountMinor === '0'),
    {
      message: 'This kind of agreement doesn’t take an amount.',
      path: ['totalAmountMinor'],
    },
  )

export const updateTermsSchema = z.object({
  title: text(140).optional(),
  deliverable: text(2000).optional(),
  totalAmountMinor: minorAmount.optional(),
  deadline: isoDate.nullable().optional(),
  paymentCondition: text(300).optional(),
  specialTerms: z.array(text(300)).max(12).optional(),
  milestones: z.array(milestoneInput).max(12).optional(),
})

export const lifecycleSchema = z.object({
  status: z.enum(PACT_STATUSES),
})

export const sealSchema = z.object({
  publicKey: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Expected a 32-byte hex public key.'),
  signature: z.string().regex(/^[0-9a-fA-F]{128}$/, 'Expected a 64-byte hex signature.'),
})

export const joinSchema = z.object({
  displayName: text(80),
  token: z.string().max(64).optional(),
})

export const updateProfileSchema = z.object({
  displayName: text(80),
})

export const visibilitySchema = z.object({
  visibility: z.enum(PACT_VISIBILITIES),
})

export const disputeSchema = z.object({
  reason: z.enum(DISPUTE_REASONS),
  detail: text(1000),
})

export const resolveDisputeSchema = z.object({
  status: z.enum(['RESOLVED', 'WITHDRAWN']),
})

export const negotiationSchema = z.object({
  message: text(1000),
  changes: z
    .array(
      z.object({
        field: text(40),
        label: text(60),
        originalValue: z.string().max(300),
        proposedValue: z.string().max(300),
      }),
    )
    .min(1, 'Say what you would like changed.')
    .max(10),
})

export const resolveNegotiationSchema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED', 'COUNTERED', 'WITHDRAWN']),
})

export const deliverableSchema = z.object({
  milestoneId: z.string().max(64).nullable().default(null),
  note: text(2000),
  link: externalLink.nullable().default(null),
})

export const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  reviewNote: z.string().trim().max(1000).nullable().default(null),
})

export const recordPaymentSchema = z.object({
  pactId: z.string().min(1).max(64),
  milestoneId: z.string().max(64).nullable().default(null),
  amountMinor: minorAmount,
  /**
   * Supplied by the client so a double tap cannot create two payment records.
   * Note there is no `toAddress` here: the recipient is resolved server-side from the
   * pact's participants. A client that could name its own recipient could render a
   * payment screen that says one thing and pays another.
   */
  idempotencyKey: z.string().min(8).max(80),
})

export const paymentStatusSchema = z.object({
  status: z.enum(['SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED']),
  txReference: z.string().max(2048).nullable().default(null),
  failureReason: z.string().max(300).nullable().default(null),
})

export const verifySchema = z.object({
  publicKey: z.string().regex(/^[0-9a-fA-F]{64}$/),
  signature: z.string().regex(/^[0-9a-fA-F]{128}$/),
  nonce: z.string().min(8).max(128),
})

export const aiExtractSchema = z.object({
  description: text(4000),
  creatorName: optionalText(80),
})

export const aiReviewSchema = z.object({
  title: text(140),
  deliverable: text(2000),
  currency: z.enum(CURRENCIES),
  totalAmountMinor: minorAmount,
  deadline: isoDate.nullable().default(null),
  paymentCondition: optionalText(300),
  specialTerms: z.array(z.string().max(300)).max(12).default([]),
  milestones: z.array(z.object({ title: z.string().max(120), amountMinor: minorAmount })).max(12).default([]),
})

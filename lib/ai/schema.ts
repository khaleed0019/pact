import { z } from 'zod'
import { CURRENCIES } from '../pact/types.ts'

/**
 * The contract between the model and the database.
 *
 * A language model's output is treated exactly like any other untrusted input: it is
 * parsed against these schemas and discarded if it does not fit. Nothing the model
 * returns is ever written straight to storage — `extract` produces a *draft* that the
 * user reviews and edits, and only the user's submission is persisted.
 */

export const extractedMilestone = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).default(''),
  /** Percentage of the total. Amounts are computed from this, never from the model. */
  percent: z.number().min(0).max(100),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
})

export const ambiguity = z.object({
  field: z.enum(['title', 'deliverable', 'amount', 'deadline', 'paymentCondition', 'parties', 'milestones']),
  /** What is unclear, in the user's own terms. */
  issue: z.string().trim().min(1).max(300),
  /** A concrete replacement the user can accept with one tap. */
  suggestion: z.string().trim().max(300).default(''),
  severity: z.enum(['high', 'medium', 'low']),
})

export const extractionSchema = z.object({
  title: z.string().trim().max(140).default(''),
  deliverable: z.string().trim().max(2000).default(''),
  clientName: z.string().trim().max(80).default(''),
  providerName: z.string().trim().max(80).default(''),
  /** Which side the person describing the deal is on. */
  authorRole: z.enum(['CLIENT', 'PROVIDER']).default('CLIENT'),
  /** A decimal string as written, e.g. "200" or "12.5". Converted to minor units later. */
  amount: z.string().trim().max(30).default(''),
  currency: z.enum(CURRENCIES).default('USDT'),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  paymentCondition: z.string().trim().max(300).default(''),
  specialTerms: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  milestones: z.array(extractedMilestone).max(12).default([]),
  ambiguities: z.array(ambiguity).max(10).default([]),
  /** The model's own confidence. Shown to the user, never used to skip their review. */
  confidence: z.number().min(0).max(1).default(0.5),
})

export type Extraction = z.infer<typeof extractionSchema>
export type Ambiguity = z.infer<typeof ambiguity>

export const reviewSchema = z.object({
  ambiguities: z.array(ambiguity).max(10).default([]),
  /** One line the user reads first. */
  verdict: z.string().trim().max(240).default(''),
})

export type Review = z.infer<typeof reviewSchema>

export const explanationSchema = z.object({
  whatYouAgreeTo: z.string().trim().max(600),
  whatYouMustDo: z.array(z.string().trim().min(1).max(240)).max(6).default([]),
  whatTheyMustDo: z.array(z.string().trim().min(1).max(240)).max(6).default([]),
  importantDates: z.array(z.string().trim().min(1).max(160)).max(6).default([]),
  paymentTerms: z.string().trim().max(400).default(''),
  risks: z.array(z.string().trim().min(1).max(240)).max(6).default([]),
})

export type Explanation = z.infer<typeof explanationSchema>

/** Marks whether an answer came from the model or the built-in reader, shown in the UI. */
export type AiSource = 'model' | 'heuristic'

export interface AiResult<T> {
  data: T
  source: AiSource
}

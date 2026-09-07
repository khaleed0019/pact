import 'server-only'
import { z } from 'zod'
import {
  explanationSchema,
  extractionSchema,
  reviewSchema,
  type AiResult,
  type Explanation,
  type Extraction,
  type Review,
} from './schema.ts'
import { heuristicExplain, heuristicExtract, heuristicReview } from './fallback.ts'
import { activeBackend, askForJson } from './providers.ts'
import type { Currency } from '../pact/types.ts'

/**
 * The AI surface, server-side only.
 *
 * Three rules this file exists to enforce:
 *
 *  1. **The key never leaves the server.** Nothing in `components/` or `app/(app)/` can
 *     import this module — it is marked `server-only` so an accidental client import is
 *     a build error rather than a leaked credential.
 *  2. **Output is validated, not trusted.** The model answers through a tool schema, and
 *     the answer is then parsed with Zod anyway. A response that does not fit is
 *     discarded and the deterministic reader runs instead.
 *  3. **There is always an answer.** No key, a timeout, a rate limit or malformed output
 *     all land in the same place: the heuristic path, labelled `heuristic` so the UI can
 *     tell the user which one they got.
 */

/** True when a model is configured. The UI uses this only to set expectations. */
export function isModelConfigured(): boolean {
  return activeBackend() !== 'none'
}

/**
 * Ask the model for one structured answer, then refuse to trust it.
 *
 * The schema is enforced twice: once by the provider (a forced tool call for Anthropic,
 * `responseSchema` for Gemini) and again by Zod here. The second pass is the one that
 * matters — a provider can drift, add a field, or return a plausible-looking object with
 * the wrong shape, and none of that is allowed anywhere near a stored agreement.
 *
 * Any failure returns `null`, which the callers below turn into the deterministic
 * reader. There is no path where a user is left without an answer.
 */
async function structured<S extends z.ZodTypeAny>(input: {
  system: string
  prompt: string
  toolName: string
  toolDescription: string
  inputSchema: Record<string, unknown>
  schema: S
}): Promise<z.output<S> | null> {
  const raw = await askForJson({
    system: input.system,
    prompt: input.prompt,
    schema: input.inputSchema,
    toolName: input.toolName,
    toolDescription: input.toolDescription,
  })
  if (raw === null) return null

  const parsed = input.schema.safeParse(raw)
  if (!parsed.success) {
    console.warn('[pact] model output failed validation, using built-in reader', parsed.error.issues[0])
    return null
  }
  return parsed.data
}

/**
 * The house style for every AI surface.
 *
 * The disclaimer is not decoration: PACT structures agreements, and a user could
 * reasonably mistake a confident tone for legal advice. The model is told plainly not to
 * give any, and the UI shows the same disclaimer next to the output.
 */
const SYSTEM = [
  'You help people turn informal working arrangements into clear, structured agreements.',
  '',
  'Rules you must follow:',
  '- You are not a lawyer and you never give legal advice. Do not reference statutes, jurisdictions or enforceability.',
  '- Never invent facts. If the user did not state an amount, a date or a name, leave that field empty rather than guessing.',
  '- Write in plain language a non-native English speaker can follow. Short sentences. No jargon, no legalese.',
  '- Flag anything genuinely ambiguous, and always propose a concrete replacement the user can accept in one tap.',
  '- Be specific about numbers. "Several videos" is exactly the kind of phrase that causes disputes.',
].join('\n')

const AMBIGUITY_SCHEMA = {
  type: 'object',
  properties: {
    field: {
      type: 'string',
      enum: ['title', 'deliverable', 'amount', 'deadline', 'paymentCondition', 'parties', 'milestones'],
    },
    issue: { type: 'string', description: 'What is unclear and why it could cause a disagreement.' },
    suggestion: { type: 'string', description: 'A concrete replacement the user can accept as-is.' },
    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['field', 'issue', 'suggestion', 'severity'],
}

export async function extractPact(input: {
  description: string
  creatorName: string
  today: string
}): Promise<AiResult<Extraction>> {
  const data = await structured({
    system: SYSTEM,
    prompt: [
      `Today is ${input.today}.`,
      input.creatorName ? `The person describing this deal is called ${input.creatorName}.` : '',
      '',
      'Turn this description into a structured agreement:',
      '',
      input.description,
    ]
      .filter(Boolean)
      .join('\n'),
    toolName: 'build_pact',
    toolDescription: 'Extract the structured agreement from the description.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A short name for the agreement, under 60 characters.' },
        deliverable: { type: 'string', description: 'Exactly what is being delivered, stated concretely.' },
        clientName: { type: 'string', description: 'Who is paying. Empty if not stated.' },
        providerName: { type: 'string', description: 'Who is doing the work. Empty if not stated.' },
        authorRole: { type: 'string', enum: ['CLIENT', 'PROVIDER'], description: 'Which side wrote this description.' },
        amount: { type: 'string', description: 'The amount as a decimal string, e.g. "200". Empty if not stated.' },
        currency: { type: 'string', enum: ['NIM', 'USDT'] },
        deadline: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null if no deadline was stated.' },
        paymentCondition: { type: 'string', description: 'When payment happens, in a short phrase.' },
        specialTerms: { type: 'array', items: { type: 'string' }, description: 'Other conditions stated by the user.' },
        milestones: {
          type: 'array',
          description: 'Only if the user described a split. Percentages must add up to 100.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              percent: { type: 'number' },
              dueDate: { type: ['string', 'null'] },
            },
            required: ['title', 'percent'],
          },
        },
        ambiguities: { type: 'array', items: AMBIGUITY_SCHEMA },
        confidence: { type: 'number', description: '0 to 1, how confident you are in this reading.' },
      },
      required: ['title', 'deliverable', 'currency', 'ambiguities', 'confidence'],
    },
    schema: extractionSchema,
  })

  if (data) return { data, source: 'model' }
  return { data: heuristicExtract(input.description, input.creatorName, new Date(input.today)), source: 'heuristic' }
}

export async function reviewPact(input: {
  title: string
  deliverable: string
  currency: Currency
  amountLabel: string
  deadline: string | null
  paymentCondition: string
  specialTerms: string[]
  milestones: Array<{ title: string; amountMinor: string }>
  today: string
}): Promise<AiResult<Review>> {
  const data = await structured({
    system: SYSTEM,
    prompt: [
      `Today is ${input.today}. Review this agreement before it is sent to the other party.`,
      '',
      `Title: ${input.title}`,
      `Deliverable: ${input.deliverable}`,
      `Value: ${input.amountLabel}`,
      `Deadline: ${input.deadline ?? 'not set'}`,
      `Payment condition: ${input.paymentCondition || 'not stated'}`,
      `Milestones: ${input.milestones.length === 0 ? 'none' : input.milestones.map((m) => m.title).join(', ')}`,
      input.specialTerms.length > 0 ? `Other terms: ${input.specialTerms.join('; ')}` : '',
      '',
      'Find anything that two reasonable people could read differently. Be brief and specific.',
    ]
      .filter(Boolean)
      .join('\n'),
    toolName: 'review_pact',
    toolDescription: 'Report ambiguities that could cause a disagreement later.',
    inputSchema: {
      type: 'object',
      properties: {
        verdict: { type: 'string', description: 'One sentence the user reads first.' },
        ambiguities: { type: 'array', items: AMBIGUITY_SCHEMA },
      },
      required: ['verdict', 'ambiguities'],
    },
    schema: reviewSchema,
  })

  if (data) return { data, source: 'model' }
  return {
    data: heuristicReview({
      deliverable: input.deliverable,
      amount: input.amountLabel,
      deadline: input.deadline,
      paymentCondition: input.paymentCondition,
      milestones: input.milestones,
    }),
    source: 'heuristic',
  }
}

export async function explainPact(input: {
  title: string
  deliverable: string
  currency: Currency
  totalAmountMinor: string
  amountLabel: string
  deadline: string | null
  paymentCondition: string
  specialTerms: string[]
  viewerRole: 'CLIENT' | 'PROVIDER'
  milestones: Array<{ title: string; amountMinor: string; dueDate: string | null }>
}): Promise<AiResult<Explanation>> {
  const data = await structured({
    system: SYSTEM,
    prompt: [
      `Explain this agreement to the ${input.viewerRole === 'CLIENT' ? 'client (the person paying)' : 'provider (the person doing the work)'}.`,
      'Address them as "you". Keep every line short enough to read on a phone.',
      '',
      `Title: ${input.title}`,
      `Deliverable: ${input.deliverable}`,
      `Value: ${input.amountLabel}`,
      `Deadline: ${input.deadline ?? 'not set'}`,
      `Payment condition: ${input.paymentCondition || 'not stated'}`,
      input.milestones.length > 0 ? `Milestones: ${input.milestones.map((m) => m.title).join(', ')}` : '',
      input.specialTerms.length > 0 ? `Other terms: ${input.specialTerms.join('; ')}` : '',
      '',
      'For risks: note that PACT records payments but does not hold them, so paying before delivery means trusting the other side.',
    ]
      .filter(Boolean)
      .join('\n'),
    toolName: 'explain_pact',
    toolDescription: 'Explain the agreement in plain language from one side of it.',
    inputSchema: {
      type: 'object',
      properties: {
        whatYouAgreeTo: { type: 'string' },
        whatYouMustDo: { type: 'array', items: { type: 'string' } },
        whatTheyMustDo: { type: 'array', items: { type: 'string' } },
        importantDates: { type: 'array', items: { type: 'string' } },
        paymentTerms: { type: 'string' },
        risks: { type: 'array', items: { type: 'string' } },
      },
      required: ['whatYouAgreeTo', 'whatYouMustDo', 'whatTheyMustDo', 'importantDates', 'paymentTerms', 'risks'],
    },
    schema: explanationSchema,
  })

  if (data) return { data, source: 'model' }
  return { data: heuristicExplain(input), source: 'heuristic' }
}

'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Sparkles, Wand2 } from 'lucide-react'
import { useSession } from '@/lib/client/session'
import { api, toUserFacing } from '@/lib/client/api'
import { AmountError, toMinor } from '@/lib/pact/money'
import { isValidAddress } from '@/lib/nimiq/address'
import { EVM_CHAINS } from '@/lib/pact/types'
import type { Currency, EvmChainKey, Pact } from '@/lib/pact/types'
import type { Ambiguity, Extraction } from '@/lib/ai/schema'
import type { UserFacingError } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { Field, Segmented, TextArea, TextInput } from '@/components/ui/Field'
import { AiDisclaimer, ErrorNotice, SectionTitle } from '@/components/ui/Bits'
import { SmartReview, SmartReviewSkeleton } from '@/components/builder/SmartReview'
import { MilestoneEditor } from '@/components/builder/MilestoneEditor'
import { EMPTY_DRAFT, type Draft, type ReviewState } from '@/components/builder/types'
import { InvitePanel } from '@/components/pact/InvitePanel'

/**
 * The AI Pact Builder.
 *
 * Two steps, in this order for a reason: **describe, then correct**. Asking someone to
 * fill in nine fields before they have seen anything is how form abandonment happens.
 * Asking them to describe the deal the way they'd say it out loud, then handing back
 * something 80% right to fix, is a completely different task — editing beats authoring.
 *
 * The extraction is never treated as authoritative. Every field it produced is editable,
 * the confidence is shown, and Smart Review's findings are suggestions with a one-tap
 * apply rather than gates.
 */

const EXAMPLES = [
  'I want to hire John to design my website for 800 NIM. He should deliver by September 20 and I’ll pay after I approve the final design.',
  'Selling my preset pack for 850 NIM, delivered as a download link once paid.',
  'I need a video editor to edit 10 videos for 150 USDT by the 20th. Half upfront, half on delivery.',
]

type Step = 'describe' | 'refine' | 'done'

export default function NewPactPage() {
  const router = useRouter()
  const { me } = useSession()

  const [step, setStep] = useState<Step>('describe')
  const [description, setDescription] = useState('')
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [review, setReview] = useState<ReviewState | null>(null)
  const [applied, setApplied] = useState<Set<number>>(new Set())
  const [extractionSource, setExtractionSource] = useState<'model' | 'heuristic'>('heuristic')
  const [confidence, setConfidence] = useState(0)

  const [busy, setBusy] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState<UserFacingError | null>(null)
  const [fieldError, setFieldError] = useState<Partial<Record<keyof Draft, string>>>({})
  const [created, setCreated] = useState<{ pact: Pact; token: string } | null>(null)

  const patch = useCallback((next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next })), [])

  /** Minor units for the current amount, or null while it is empty or malformed. */
  const totalMinor = useMemo(() => {
    try {
      return draft.amount.trim() ? toMinor(draft.amount, draft.currency) : null
    } catch {
      return null
    }
  }, [draft.amount, draft.currency])

  // --- step one: extract -------------------------------------------------------------

  const build = async () => {
    if (description.trim().length < 12) {
      setError({
        code: 'VALIDATION',
        title: 'Tell PACT a bit more',
        body: 'Describe what is being delivered, for how much, and by when. A sentence or two is plenty.',
        retry: false,
      })
      return
    }

    setBusy(true)
    setError(null)
    try {
      const result = await api<{ extraction: Extraction; source: 'model' | 'heuristic' }>('/api/ai/extract', {
        method: 'POST',
        body: { description, creatorName: me?.displayName ?? '' },
      })

      const extraction = result.extraction
      const currency = extraction.currency as Currency

      setDraft({
        title: extraction.title || 'Untitled agreement',
        deliverable: extraction.deliverable || description,
        creatorRole: extraction.authorRole,
        creatorName: (extraction.authorRole === 'CLIENT' ? extraction.clientName : extraction.providerName) || me?.displayName || 'You',
        counterpartyName:
          (extraction.authorRole === 'CLIENT' ? extraction.providerName : extraction.clientName) || 'Other party',
        counterpartyAddress: '',
        currency,
        chain: currency === 'USDT' ? 'polygon' : null,
        amount: extraction.amount,
        deadline: extraction.deadline ?? '',
        paymentCondition: extraction.paymentCondition,
        specialTerms: extraction.specialTerms,
        milestones: extraction.milestones.map((m) => ({
          title: m.title,
          description: m.description,
          percent: m.percent,
          dueDate: m.dueDate ?? '',
        })),
      })

      setExtractionSource(result.source)
      setConfidence(extraction.confidence)
      setReview({ ambiguities: extraction.ambiguities, verdict: verdictFor(extraction.ambiguities), source: result.source })
      setApplied(new Set())
      setStep('refine')
      window.scrollTo({ top: 0 })
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setBusy(false)
    }
  }

  // --- step two: refine --------------------------------------------------------------

  const rerunReview = async () => {
    if (!totalMinor) return
    setReviewing(true)
    try {
      const result = await api<{ review: { ambiguities: Ambiguity[]; verdict: string }; source: 'model' | 'heuristic' }>(
        '/api/ai/review',
        {
          method: 'POST',
          body: {
            title: draft.title,
            deliverable: draft.deliverable,
            currency: draft.currency,
            totalAmountMinor: totalMinor,
            deadline: draft.deadline || null,
            paymentCondition: draft.paymentCondition,
            specialTerms: draft.specialTerms,
            milestones: draft.milestones.map((m) => ({ title: m.title, amountMinor: '1' })),
          },
        },
      )
      setReview({ ...result.review, source: result.source })
      setApplied(new Set())
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setReviewing(false)
    }
  }

  /**
   * Apply one suggestion.
   *
   * Only fields with an unambiguous target are written automatically. For a suggestion
   * about the deliverable's wording, PACT appends it as a special term rather than
   * silently rewriting text the user authored — replacing someone's own description with
   * a model's paraphrase, without showing them, is exactly the behaviour this product is
   * meant to prevent.
   */
  const applySuggestion = (ambiguity: Ambiguity, index: number) => {
    switch (ambiguity.field) {
      case 'deadline':
        if (/^\d{4}-\d{2}-\d{2}$/.test(ambiguity.suggestion)) patch({ deadline: ambiguity.suggestion })
        break
      case 'paymentCondition':
        patch({ paymentCondition: ambiguity.suggestion })
        break
      case 'milestones':
        if (draft.milestones.length === 0) {
          patch({
            milestones: [
              { title: 'Project start', description: '', percent: 50, dueDate: '' },
              { title: 'Final delivery', description: '', percent: 50, dueDate: draft.deadline },
            ],
          })
        }
        break
      default:
        patch({ specialTerms: [...draft.specialTerms, ambiguity.suggestion] })
    }
    setApplied((current) => new Set(current).add(index))
  }

  const validate = (): boolean => {
    const errors: Partial<Record<keyof Draft, string>> = {}

    if (!draft.title.trim()) errors.title = 'Give this agreement a name.'
    if (!draft.deliverable.trim()) errors.deliverable = 'Say what is being delivered.'
    if (!draft.counterpartyName.trim()) errors.counterpartyName = 'Who is this with?'

    try {
      toMinor(draft.amount, draft.currency)
    } catch (cause) {
      errors.amount = cause instanceof AmountError ? cause.message : 'Enter a valid amount.'
    }

    if (draft.counterpartyAddress.trim() && !isValidAddress(draft.counterpartyAddress)) {
      errors.counterpartyAddress = 'That is not a valid Nimiq address. Leave it blank to invite by link instead.'
    }

    const percentTotal = draft.milestones.reduce((sum, m) => sum + m.percent, 0)
    if (draft.milestones.length > 0 && Math.abs(percentTotal - 100) > 0.01) {
      errors.milestones = 'Milestone shares need to add up to 100%.'
    }
    if (draft.milestones.some((m) => !m.title.trim())) {
      errors.milestones = 'Every milestone needs a name.'
    }

    setFieldError(errors)
    return Object.keys(errors).length === 0
  }

  const create = async () => {
    if (!validate()) return

    setBusy(true)
    setError(null)
    try {
      const result = await api<{ pact: Pact; invitation: { token: string } }>('/api/pacts', {
        method: 'POST',
        body: {
          title: draft.title,
          deliverable: draft.deliverable,
          creatorRole: draft.creatorRole,
          creatorName: draft.creatorName || me?.displayName || 'You',
          counterpartyName: draft.counterpartyName,
          counterpartyAddress: draft.counterpartyAddress.trim() || null,
          currency: draft.currency,
          chain: draft.chain,
          totalAmountMinor: toMinor(draft.amount, draft.currency),
          deadline: draft.deadline || null,
          paymentCondition: draft.paymentCondition || 'On delivery',
          specialTerms: draft.specialTerms,
          milestones: draft.milestones.map((m) => ({
            title: m.title,
            description: m.description,
            // The server recomputes this from `percent`; sending it keeps the schema honest.
            amountMinor: '1',
            percent: m.percent,
            dueDate: m.dueDate || null,
          })),
        },
      })

      setCreated({ pact: result.pact, token: result.invitation.token })
      setStep('done')
      window.scrollTo({ top: 0 })
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setBusy(false)
    }
  }

  // --- render ------------------------------------------------------------------------

  if (step === 'done' && created) {
    return (
      <main className="safe-top mx-auto w-full max-w-[34rem] px-5 pb-10">
        <InvitePanel
          pact={created.pact}
          token={created.token}
          onDone={() => router.push(`/p/${created.pact.id}`)}
        />
      </main>
    )
  }

  return (
    <main className="safe-top mx-auto w-full max-w-[34rem] px-5 pb-32">
      <header className="flex items-center gap-2 py-3">
        <Link
          href={step === 'refine' ? '#' : '/'}
          onClick={(event) => {
            if (step === 'refine') {
              event.preventDefault()
              setStep('describe')
            }
          }}
          aria-label="Back"
          className="-ml-2 flex h-tap w-tap items-center justify-center rounded-full text-chalk-muted active:bg-white/10"
        >
          <ArrowLeft aria-hidden className="h-5 w-5" />
        </Link>
        <h1 className="text-heading text-chalk">{step === 'describe' ? 'New agreement' : 'Check the details'}</h1>
      </header>

      {step === 'describe' ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="mb-5">
            <h2 className="text-display text-chalk">Describe the deal.</h2>
            <p className="mt-2 text-body leading-relaxed text-chalk-muted">
              Write it the way you’d say it to the other person. PACT turns it into terms you can both sign.
            </p>
          </div>

          <Field label="What did you agree?" hint="Include what, how much, and by when.">
            {({ inputId, describedBy }) => (
              <TextArea
                id={inputId}
                aria-describedby={describedBy}
                rows={6}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="I want to hire John to design my website for 800 NIM…"
                maxLength={4000}
              />
            )}
          </Field>

          <div className="mt-5">
            <SectionTitle>Or start from an example</SectionTitle>
            <div className="space-y-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setDescription(example)}
                  className="surface-quiet w-full px-3.5 py-3 text-left text-small leading-relaxed text-chalk-muted active:bg-white/[0.06]"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {error && <ErrorNotice error={error} className="mt-5" />}

          <div className="safe-bottom fixed inset-x-0 bottom-0 mx-auto max-w-[34rem] bg-gradient-to-t from-ink-900 via-ink-900/95 to-transparent px-5 pt-8">
            <Button size="lg" fullWidth busy={busy} onClick={() => void build()}>
              <Wand2 aria-hidden className="h-4 w-4" />
              Build my PACT
            </Button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="surface-quiet flex items-start gap-2.5 px-3.5 py-3">
            <Sparkles aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <div className="min-w-0">
              <p className="text-small text-chalk">
                Here’s what PACT understood{confidence > 0 ? ` (${Math.round(confidence * 100)}% confident)` : ''}. Change
                anything that isn’t right.
              </p>
              <AiDisclaimer source={extractionSource} className="mt-2" />
            </div>
          </div>

          <section className="space-y-4">
            <SectionTitle>The agreement</SectionTitle>

            <Field label="Name" error={fieldError.title}>
              {({ inputId }) => (
                <TextInput
                  id={inputId}
                  value={draft.title}
                  error={Boolean(fieldError.title)}
                  onChange={(event) => patch({ title: event.target.value })}
                  maxLength={140}
                />
              )}
            </Field>

            <Field label="What’s being delivered" error={fieldError.deliverable}>
              {({ inputId }) => (
                <TextArea
                  id={inputId}
                  rows={4}
                  value={draft.deliverable}
                  error={Boolean(fieldError.deliverable)}
                  onChange={(event) => patch({ deliverable: event.target.value })}
                  maxLength={2000}
                />
              )}
            </Field>

            <Field label="Your side of this">
              {() => (
                <Segmented
                  label="Your role"
                  value={draft.creatorRole}
                  onChange={(role) => patch({ creatorRole: role })}
                  options={[
                    { value: 'CLIENT', label: 'I’m paying', hint: 'client' },
                    { value: 'PROVIDER', label: 'I’m delivering', hint: 'provider' },
                  ]}
                />
              )}
            </Field>

            <Field label="Who is it with?" error={fieldError.counterpartyName}>
              {({ inputId }) => (
                <TextInput
                  id={inputId}
                  value={draft.counterpartyName}
                  error={Boolean(fieldError.counterpartyName)}
                  onChange={(event) => patch({ counterpartyName: event.target.value })}
                  placeholder="Their name"
                  maxLength={80}
                />
              )}
            </Field>

            <Field
              label="Their Nimiq address"
              hint="Optional. Leave blank and PACT gives you a link to send them instead."
              error={fieldError.counterpartyAddress}
            >
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  value={draft.counterpartyAddress}
                  error={Boolean(fieldError.counterpartyAddress)}
                  onChange={(event) => patch({ counterpartyAddress: event.target.value })}
                  placeholder="NQ.."
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="font-mono text-small"
                />
              )}
            </Field>
          </section>

          <section className="space-y-4">
            <SectionTitle>Money</SectionTitle>

            <Field label="Paid in">
              {() => (
                <Segmented
                  label="Currency"
                  value={draft.currency}
                  onChange={(currency) =>
                    patch({ currency, chain: currency === 'USDT' ? (draft.chain ?? 'polygon') : null })
                  }
                  options={[
                    { value: 'NIM', label: 'NIM', hint: 'native · on-chain memo' },
                    { value: 'USDT', label: 'USDT', hint: 'stable value' },
                  ]}
                />
              )}
            </Field>

            {draft.currency === 'NIM' && (
              <p className="flex items-start gap-2 rounded-xl border border-gold/20 bg-gold/[0.06] px-3.5 py-3 text-[0.7rem] leading-relaxed text-chalk-muted">
                <span aria-hidden className="mt-0.5 text-gold-bright">
                  ●
                </span>
                <span>
                  <span className="font-medium text-chalk">NIM payments carry this agreement’s reference in the
                  transaction itself.</span> When you pay a milestone, PACT writes it into the transaction’s data
                  field — so the payment’s purpose is on the Nimiq blockchain, not just in PACT’s own records.
                </span>
              </p>
            )}

            <Field label="Amount" error={fieldError.amount}>
              {({ inputId }) => (
                <div className="relative">
                  <TextInput
                    id={inputId}
                    inputMode="decimal"
                    value={draft.amount}
                    error={Boolean(fieldError.amount)}
                    onChange={(event) => patch({ amount: event.target.value })}
                    placeholder="200"
                    className="pr-16 text-title"
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-small font-medium text-chalk-faint">
                    {draft.currency}
                  </span>
                </div>
              )}
            </Field>

            {draft.currency === 'USDT' && (
              <Field
                label="Network"
                hint="Network fees are paid in that chain’s own coin, not in USDT."
              >
                {({ inputId, describedBy }) => (
                  <select
                    id={inputId}
                    aria-describedby={describedBy}
                    value={draft.chain ?? 'polygon'}
                    onChange={(event) => patch({ chain: event.target.value as EvmChainKey })}
                    className="min-h-tap w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-3 text-body text-chalk focus:border-gold/50 focus:outline-none"
                  >
                    {Object.entries(EVM_CHAINS).map(([key, chain]) => (
                      <option key={key} value={key} className="bg-ink-850">
                        {chain.name} · fees in {chain.nativeSymbol}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}

            <Field label="Deadline">
              {({ inputId }) => (
                <TextInput
                  id={inputId}
                  type="date"
                  value={draft.deadline}
                  onChange={(event) => patch({ deadline: event.target.value })}
                />
              )}
            </Field>

            <Field label="When does payment happen?">
              {({ inputId }) => (
                <TextInput
                  id={inputId}
                  value={draft.paymentCondition}
                  onChange={(event) => patch({ paymentCondition: event.target.value })}
                  placeholder="After final approval"
                  maxLength={300}
                />
              )}
            </Field>
          </section>

          <section>
            <SectionTitle>Milestones</SectionTitle>
            <MilestoneEditor
              milestones={draft.milestones}
              currency={draft.currency}
              totalMinor={totalMinor}
              onChange={(milestones) => patch({ milestones })}
            />
            {fieldError.milestones && (
              <p role="alert" className="mt-2 text-[0.7rem] text-rose">
                {fieldError.milestones}
              </p>
            )}
          </section>

          {draft.specialTerms.length > 0 && (
            <section>
              <SectionTitle>Other terms</SectionTitle>
              <ul className="surface divide-y divide-white/[0.06]">
                {draft.specialTerms.map((term, index) => (
                  <li key={index} className="flex items-start gap-2.5 px-4 py-3">
                    <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-chalk-faint" />
                    <span className="min-w-0 flex-1 text-small leading-relaxed text-chalk-muted">{term}</span>
                    <button
                      type="button"
                      onClick={() => patch({ specialTerms: draft.specialTerms.filter((_, i) => i !== index) })}
                      className="shrink-0 text-[0.7rem] text-chalk-faint underline underline-offset-4"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {reviewing ? (
            <SmartReviewSkeleton />
          ) : review ? (
            <SmartReview
              ambiguities={review.ambiguities}
              verdict={review.verdict}
              source={review.source}
              applied={applied}
              onApply={applySuggestion}
              busy={busy}
            />
          ) : null}

          <Button variant="quiet" size="sm" onClick={() => void rerunReview()} disabled={reviewing || !totalMinor}>
            Re-run smart review
          </Button>

          {error && <ErrorNotice error={error} />}

          <div className="safe-bottom fixed inset-x-0 bottom-0 mx-auto max-w-[34rem] bg-gradient-to-t from-ink-900 via-ink-900/95 to-transparent px-5 pt-8">
            <Button size="lg" fullWidth busy={busy} onClick={() => void create()}>
              Create this PACT
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </main>
  )
}

function verdictFor(ambiguities: Ambiguity[]): string {
  const high = ambiguities.filter((a) => a.severity === 'high').length
  if (high > 0) return `${high} thing${high === 1 ? '' : 's'} here could be read two ways.`
  if (ambiguities.length > 0) return 'The essentials are covered. A couple of details could be tighter.'
  return 'This reads clearly. Both sides should know exactly what was agreed.'
}

'use client'

import { useState } from 'react'
import { AlertTriangle, ArrowRight, ExternalLink, Package, Sparkles } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Field, TextArea, TextInput } from '@/components/ui/Field'
import { AiDisclaimer, ErrorNotice } from '@/components/ui/Bits'
import { api, toUserFacing } from '@/lib/client/api'
import { formatWithCurrency } from '@/lib/pact/money'
import { formatLongDate } from '@/lib/format'
import { DISPUTE_REASON_META } from '@/lib/pact/state'
import { usesPayment } from '@/lib/pact/categories'
import { cn } from '@/lib/cn'
import type { Explanation } from '@/lib/ai/schema'
import { DISPUTE_REASONS, type DisputeReason, type Milestone, type PactDetail } from '@/lib/pact/types'
import type { UserFacingError } from '@/lib/errors'

/** The three lighter action sheets: submit work, propose changes, explain the deal. */

// --- delivery -----------------------------------------------------------------------

export function DeliverySheet({
  open,
  onClose,
  pact,
  milestone,
  onSubmitted,
}: {
  open: boolean
  onClose: () => void
  pact: PactDetail
  milestone: Milestone | null
  onSubmitted: () => void
}) {
  const [note, setNote] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UserFacingError | null>(null)

  const submit = async () => {
    if (note.trim().length === 0) return
    setBusy(true)
    setError(null)
    try {
      await api(`/api/pacts/${pact.id}/deliverables`, {
        method: 'POST',
        body: { milestoneId: milestone?.id ?? null, note: note.trim(), link: link.trim() || null },
      })
      setNote('')
      setLink('')
      onSubmitted()
      onClose()
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Submit your work"
      description={milestone ? `For ${milestone.title}` : 'For the whole agreement'}
      footer={
        <Button size="lg" fullWidth busy={busy} disabled={note.trim().length === 0} onClick={() => void submit()}>
          <Package aria-hidden className="h-4 w-4" />
          Submit delivery
        </Button>
      }
    >
      <div className="space-y-4 py-1">
        <Field label="What are you delivering?" hint="This is timestamped, so it’s your record of when you delivered.">
          {({ inputId, describedBy }) => (
            <TextArea
              id={inputId}
              aria-describedby={describedBy}
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Final website design has been delivered."
              maxLength={2000}
            />
          )}
        </Field>

        <Field label="Link" hint="Optional. A Figma file, a Drive folder, a repo — wherever the work lives.">
          {({ inputId, describedBy }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              type="url"
              inputMode="url"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://"
              spellCheck={false}
            />
          )}
        </Field>

        {error && <ErrorNotice error={error} />}
      </div>
    </Sheet>
  )
}

// --- negotiation --------------------------------------------------------------------

/**
 * Fields PACT can apply automatically when a proposal is accepted.
 *
 * The two money fields are only offered when the category has money in it — proposing a
 * change to the amount of a commitment is a change to a number that does not exist.
 */
const NEGOTIABLE = [
  { field: 'deadline', label: 'Deadline', kind: 'date' as const, money: false },
  { field: 'totalAmount', label: 'Amount', kind: 'text' as const, money: true },
  { field: 'paymentCondition', label: 'Payment condition', kind: 'text' as const, money: true },
  { field: 'deliverable', label: 'What’s delivered', kind: 'text' as const, money: false },
]

export function NegotiationSheet({
  open,
  onClose,
  pact,
  onProposed,
}: {
  open: boolean
  onClose: () => void
  pact: PactDetail
  onProposed: () => void
}) {
  const [message, setMessage] = useState('')
  const [changes, setChanges] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UserFacingError | null>(null)

  const negotiable = NEGOTIABLE.filter((entry) => !entry.money || usesPayment(pact.category))

  const currentValue = (field: string): string => {
    switch (field) {
      case 'deadline':
        return pact.deadline ?? ''
      case 'totalAmount':
        return formatWithCurrency(pact.totalAmountMinor, pact.currency).replace(` ${pact.currency}`, '')
      case 'paymentCondition':
        return pact.paymentCondition
      case 'deliverable':
        return pact.deliverable
      default:
        return ''
    }
  }

  const active = negotiable.filter((entry) => {
    const proposed = changes[entry.field]
    return proposed !== undefined && proposed.trim() !== '' && proposed.trim() !== currentValue(entry.field).trim()
  })

  const submit = async () => {
    if (active.length === 0 || message.trim().length === 0) return
    setBusy(true)
    setError(null)
    try {
      await api(`/api/pacts/${pact.id}/negotiations`, {
        method: 'POST',
        body: {
          message: message.trim(),
          changes: active.map((entry) => ({
            field: entry.field,
            label: entry.label,
            originalValue: currentValue(entry.field),
            proposedValue: changes[entry.field].trim(),
          })),
        },
      })
      setMessage('')
      setChanges({})
      onProposed()
      onClose()
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Propose changes"
      description="Change only what you want to move. The other side sees a before and after."
      footer={
        <Button
          size="lg"
          fullWidth
          busy={busy}
          disabled={active.length === 0 || message.trim().length === 0}
          onClick={() => void submit()}
        >
          Send {active.length > 0 ? `${active.length} change${active.length === 1 ? '' : 's'}` : 'proposal'}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-4 py-1">
        {negotiable.map((entry) => (
          <Field key={entry.field} label={entry.label}>
            {({ inputId }) => (
              <div className="space-y-1.5">
                <p className="text-[0.7rem] text-chalk-faint">
                  Now: <span className="text-chalk-muted">{currentValue(entry.field) || 'not set'}</span>
                </p>
                {entry.kind === 'date' ? (
                  <TextInput
                    id={inputId}
                    type="date"
                    value={changes[entry.field] ?? ''}
                    onChange={(event) => setChanges((c) => ({ ...c, [entry.field]: event.target.value }))}
                  />
                ) : (
                  <TextInput
                    id={inputId}
                    value={changes[entry.field] ?? ''}
                    onChange={(event) => setChanges((c) => ({ ...c, [entry.field]: event.target.value }))}
                    placeholder="Leave blank to keep as is"
                    maxLength={300}
                  />
                )}
              </div>
            )}
          </Field>
        ))}

        <Field label="Why?" hint="A sentence is enough. They’ll see this next to your changes.">
          {({ inputId, describedBy }) => (
            <TextArea
              id={inputId}
              aria-describedby={describedBy}
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Can we make the deadline the 25th instead? I want to get the mobile layouts right."
              maxLength={1000}
            />
          )}
        </Field>

        <p className="px-1 text-[0.7rem] leading-relaxed text-chalk-faint">
          If they accept, the terms change — which means both of you will need to sign again.
        </p>

        {error && <ErrorNotice error={error} />}
      </div>
    </Sheet>
  )
}

// --- dispute ------------------------------------------------------------------------

export function DisputeSheet({
  open,
  onClose,
  pact,
  onRaised,
}: {
  open: boolean
  onClose: () => void
  pact: PactDetail
  onRaised: () => void
}) {
  const [reason, setReason] = useState<DisputeReason | null>(null)
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UserFacingError | null>(null)

  const submit = async () => {
    if (!reason || detail.trim().length === 0) return
    setBusy(true)
    setError(null)
    try {
      await api(`/api/pacts/${pact.id}/disputes`, {
        method: 'POST',
        body: { reason, detail: detail.trim() },
      })
      setReason(null)
      setDetail('')
      onRaised()
      onClose()
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Raise an issue"
      description="This is recorded on the timeline and the other side sees it immediately."
      footer={
        <Button
          size="lg"
          variant="danger"
          fullWidth
          busy={busy}
          disabled={!reason || detail.trim().length === 0}
          onClick={() => void submit()}
        >
          <AlertTriangle aria-hidden className="h-4 w-4" />
          Raise this issue
        </Button>
      }
    >
      <div className="space-y-4 py-1">
        <fieldset className="space-y-1.5">
          <legend className="text-small font-medium text-chalk">What’s wrong?</legend>
          <div className="space-y-2 pt-1">
            {DISPUTE_REASONS.map((value) => {
              const meta = DISPUTE_REASON_META[value]
              const selected = reason === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setReason(value)}
                  className={cn(
                    'min-h-tap w-full rounded-xl border px-3.5 py-3 text-left transition-colors duration-150',
                    selected
                      ? 'border-rose/45 bg-rose/[0.10]'
                      : 'border-white/[0.08] bg-white/[0.02] active:bg-white/[0.06]',
                  )}
                >
                  <span className={cn('block text-small font-medium', selected ? 'text-chalk' : 'text-chalk-muted')}>
                    {meta.label}
                  </span>
                  <span className="mt-0.5 block text-[0.7rem] leading-relaxed text-chalk-faint">{meta.hint}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <Field
          label="What happened?"
          hint="They see this word for word, so write it the way you’d say it to them."
        >
          {({ inputId, describedBy }) => (
            <TextArea
              id={inputId}
              aria-describedby={describedBy}
              rows={4}
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              placeholder="The final files were due on the 12th and I haven’t received anything yet."
              maxLength={1000}
            />
          )}
        </Field>

        {/* Saying plainly what this does and does not do. The alternative is a user who
            thinks raising an issue claws their money back, and finds out otherwise later. */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3">
          <h3 className="text-micro font-semibold uppercase tracking-[0.14em] text-chalk-faint">What happens next</h3>
          <ul className="mt-2 space-y-1.5">
            {[
              'The agreement is marked as having an open issue, for both of you.',
              'The other side sees your reason and your description, and can reply.',
              'Either of you can mark it resolved once you’ve worked it out.',
              'PACT doesn’t decide who’s right, and no payment is reversed or held.',
            ].map((line) => (
              <li key={line} className="flex gap-2 text-[0.7rem] leading-relaxed text-chalk-muted">
                <span aria-hidden className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-chalk-faint" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        {error && <ErrorNotice error={error} />}
      </div>
    </Sheet>
  )
}

// --- explain ------------------------------------------------------------------------

export function ExplainSheet({ open, onClose, pact }: { open: boolean; onClose: () => void; pact: PactDetail }) {
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [source, setSource] = useState<'model' | 'heuristic'>('heuristic')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UserFacingError | null>(null)

  const load = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ explanation: Explanation; source: 'model' | 'heuristic' }>(
        `/api/ai/explain/${pact.id}`,
        { method: 'POST' },
      )
      setExplanation(result.explanation)
      setSource(result.source)
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="What this means for you"
      description="Written from your side of the agreement."
      footer={
        !explanation ? (
          <Button size="lg" fullWidth busy={busy} onClick={() => void load()}>
            <Sparkles aria-hidden className="h-4 w-4" />
            Explain this PACT
          </Button>
        ) : (
          <Button variant="secondary" size="lg" fullWidth onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="space-y-4 py-1">
        {!explanation && !busy && !error && (
          <p className="text-small leading-relaxed text-chalk-muted">
            PACT will read this agreement back to you in plain language — what you’ve committed to, what the other side
            owes you, the dates that matter, and where the risk sits.
          </p>
        )}

        {error && <ErrorNotice error={error} onRetry={() => void load()} />}

        {explanation && (
          <>
            <Block title="What you’re agreeing to">
              <p className="text-small leading-relaxed text-chalk-muted">{explanation.whatYouAgreeTo}</p>
            </Block>
            <Block title="What you need to do">
              <List items={explanation.whatYouMustDo} />
            </Block>
            <Block title="What they need to do">
              <List items={explanation.whatTheyMustDo} />
            </Block>
            <Block title="Dates that matter">
              <List items={explanation.importantDates} />
            </Block>
            <Block title="Payment">
              <p className="text-small leading-relaxed text-chalk-muted">{explanation.paymentTerms}</p>
            </Block>
            <Block title="Worth knowing" tone="warn">
              <List items={explanation.risks} />
            </Block>
            <AiDisclaimer source={source} />
          </>
        )}
      </div>
    </Sheet>
  )
}

function Block({ title, children, tone }: { title: string; children: React.ReactNode; tone?: 'warn' }) {
  return (
    <section
      className={
        tone === 'warn'
          ? 'rounded-xl border border-amber/25 bg-amber/[0.06] px-3.5 py-3'
          : 'surface-quiet px-3.5 py-3'
      }
    >
      <h3 className="text-micro font-semibold uppercase tracking-[0.14em] text-chalk-faint">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-small text-chalk-faint">Nothing noted.</p>
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2 text-small leading-relaxed text-chalk-muted">
          <span aria-hidden className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-chalk-faint" />
          {item}
        </li>
      ))}
    </ul>
  )
}

/** Small helper used by the detail screen for external deliverable links. */
export function DeliverableLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-azure-bright underline underline-offset-4"
    >
      Open delivery
      <ExternalLink aria-hidden className="h-3 w-3" />
    </a>
  )
}

/** Re-exported so the detail screen can render a milestone due date consistently. */
export { formatLongDate }

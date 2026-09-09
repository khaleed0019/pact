'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Hammer,
  MessageSquareReply,
  Package,
  PenLine,
  Sparkles,
  ThumbsUp,
  Wallet,
} from 'lucide-react'
import { useSession } from '@/lib/client/session'
import { api, toUserFacing } from '@/lib/client/api'
import { hasEvmProvider } from '@/lib/nimiq/evm'
import { normalizeAddress } from '@/lib/nimiq/address'
import { formatLongDate, relativeDeadline, relativeTime } from '@/lib/format'
import { DISPUTE_REASON_META, STATUS_META } from '@/lib/pact/state'
import { EVM_CHAINS } from '@/lib/pact/types'
import type { Milestone, PactDetail, ParticipantRole } from '@/lib/pact/types'
import type { UserFacingError } from '@/lib/errors'
import { PactSeal } from '@/components/seal/PactSeal'
import { Timeline } from '@/components/pact/Timeline'
import { PaymentSheet, payabilityReason } from '@/components/pact/PaymentSheet'
import { SealSheet } from '@/components/pact/SealSheet'
import { DeliverySheet, DisputeSheet, ExplainSheet, NegotiationSheet } from '@/components/pact/ActionSheets'
import { Button } from '@/components/ui/Button'
import {
  AddressChip,
  ErrorNotice,
  Fingerprint,
  Money,
  SectionTitle,
  Skeleton,
  StatusPill,
  Tag,
} from '@/components/ui/Bits'
import { cn } from '@/lib/cn'

/**
 * The agreement itself.
 *
 * Structured so the answer to "what now?" is never more than one glance away: the seal
 * and status at the top, one contextual primary action pinned in the thumb zone, and the
 * detail — terms, signatures, milestones, history — in between for when someone wants it.
 *
 * There is exactly one primary action at a time, chosen from the lifecycle state and the
 * viewer's role. Showing every possible action and greying out the invalid ones would be
 * easier to write and much harder to use.
 */

type SheetKind = 'seal' | 'pay' | 'deliver' | 'negotiate' | 'explain' | 'dispute' | null

export default function PactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { me } = useSession()

  const [pact, setPact] = useState<PactDetail | null>(null)
  const [role, setRole] = useState<ParticipantRole | null>(null)
  const [error, setError] = useState<UserFacingError | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [payTarget, setPayTarget] = useState<Milestone | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await api<{ pact: PactDetail; viewer: { role: ParticipantRole } }>(`/api/pacts/${id}`)
      setPact(result.pact)
      setRole(result.viewer.role)
      setError(null)
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Record this user's EVM address once, quietly.
   *
   * USDT cannot be sent to a Nimiq address, so the counterparty needs an EVM address on
   * file before they can be paid. Reading it from the wallet on first view means neither
   * party is ever asked to type a 42-character address — `eth_accounts` is the
   * non-prompting read, so this does not interrupt anyone.
   */
  useEffect(() => {
    if (!pact || pact.currency !== 'USDT' || !me?.address || !hasEvmProvider()) return

    const self = pact.participants.find((p) => p.address && normalizeAddress(p.address) === normalizeAddress(me.address!))
    if (!self || self.evmAddress) return

    const provider = (globalThis as { ethereum?: { request(args: { method: string }): Promise<unknown> } }).ethereum
    provider
      ?.request({ method: 'eth_accounts' })
      .then(async (accounts) => {
        const address = Array.isArray(accounts) ? (accounts[0] as string | undefined) : undefined
        if (!address) return
        await api(`/api/pacts/${pact.id}/evm-address`, { method: 'PUT', body: { evmAddress: address } })
        await load()
      })
      .catch(() => {
        // Best effort. If it fails, the payment screen explains what is missing.
      })
  }, [pact, me?.address, load])

  const transition = async (status: string) => {
    setBusy(true)
    try {
      await api(`/api/pacts/${id}/lifecycle`, { method: 'POST', body: { status } })
      await load()
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setBusy(false)
    }
  }

  const reviewDelivery = async (deliverableId: string, status: 'APPROVED' | 'CHANGES_REQUESTED') => {
    setBusy(true)
    try {
      await api(`/api/deliverables/${deliverableId}`, { method: 'PATCH', body: { status, reviewNote: null } })
      await load()
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setBusy(false)
    }
  }

  const answerProposal = async (negotiationId: string, status: 'ACCEPTED' | 'DECLINED') => {
    setBusy(true)
    try {
      await api(`/api/negotiations/${negotiationId}`, { method: 'PATCH', body: { status } })
      await load()
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setBusy(false)
    }
  }

  const closeDispute = async (disputeId: string, status: 'RESOLVED' | 'WITHDRAWN') => {
    setBusy(true)
    try {
      await api(`/api/disputes/${disputeId}`, { method: 'PATCH', body: { status } })
      await load()
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setBusy(false)
    }
  }

  const self = useMemo(
    () =>
      pact && me?.address
        ? pact.participants.find((p) => p.address && normalizeAddress(p.address) === normalizeAddress(me.address!))
        : undefined,
    [pact, me?.address],
  )
  const other = useMemo(() => pact?.participants.find((p) => p !== self), [pact, self])
  const openProposal = pact?.negotiations.find((n) => n.status === 'OPEN')
  const openDispute = pact?.disputes.find((d) => d.status === 'OPEN')
  const raisedByMe =
    openDispute != null && normalizeAddress(openDispute.raisedBy) === normalizeAddress(me?.address ?? '')
  const pendingDelivery = pact?.deliverables.find((d) => d.status === 'SUBMITTED')
  const nextUnpaid = pact?.milestones.find((m) => m.status !== 'PAID' && m.status !== 'CANCELLED')
  const cannotPay = pact ? payabilityReason(pact) : null

  /**
   * A pact with no milestones is paid in one shot — `milestoneId: null` on the payment,
   * exactly what `PaymentSheet` and `/api/payments` already do when passed no milestone.
   * Without this, `nextUnpaid` is permanently undefined for such a pact (there are no
   * milestones to find), so the primary action skipped straight from "delivered" to
   * "mark complete" with no payment step ever offered — a milestoneless PACT could reach
   * COMPLETED having never been paid. Milestoned pacts don't have this gap: `nextUnpaid`
   * already keeps "Pay" ahead of "Mark complete" in the priority order below.
   */
  const owesFullPayment =
    pact != null &&
    pact.milestones.length === 0 &&
    !pact.payments.some((p) => p.milestoneId === null && p.status === 'CONFIRMED')

  /** The single most useful thing this person can do right now. */
  const primary = useMemo(() => {
    if (!pact || !role) return null

    if (openProposal && normalizeAddress(openProposal.proposedBy) !== normalizeAddress(me?.address ?? '')) {
      return { label: 'Review the changes', icon: MessageSquareReply, run: () => setSheet(null), scrollTo: 'negotiation' }
    }
    if ((pact.status === 'PENDING' || pact.status === 'NEGOTIATING') && self && !self.sealSignature) {
      return { label: 'Read and sign', icon: PenLine, run: () => setSheet('seal') }
    }
    if (pact.status === 'DRAFT') {
      return { label: 'Send for signature', icon: ArrowRight, run: () => void transition('PENDING') }
    }
    if (pact.status === 'ACTIVE' && role === 'PROVIDER') {
      return { label: 'Start work', icon: Hammer, run: () => void transition('IN_PROGRESS') }
    }
    if (pendingDelivery && role === 'CLIENT') {
      return { label: 'Review the delivery', icon: ThumbsUp, run: () => void reviewDelivery(pendingDelivery.id, 'APPROVED') }
    }
    if ((pact.status === 'IN_PROGRESS' || pact.status === 'ACTIVE') && role === 'PROVIDER') {
      return { label: 'Submit a delivery', icon: Package, run: () => setSheet('deliver') }
    }
    if (role === 'CLIENT' && (nextUnpaid || owesFullPayment) && ['ACTIVE', 'IN_PROGRESS', 'DELIVERED'].includes(pact.status)) {
      return {
        label: nextUnpaid ? `Pay ${nextUnpaid.title}` : 'Pay in full',
        icon: Wallet,
        run: () => {
          setPayTarget(nextUnpaid ?? null)
          setSheet('pay')
        },
        disabled: cannotPay !== null,
      }
    }
    if (pact.status === 'DELIVERED' && role === 'CLIENT') {
      return { label: 'Mark complete', icon: CircleCheck, run: () => void transition('COMPLETED') }
    }
    return null
  }, [pact, role, self, openProposal, pendingDelivery, nextUnpaid, owesFullPayment, cannotPay, me?.address])

  if (loading) return <DetailSkeleton />

  if (!pact || error) {
    return (
      <main className="safe-top mx-auto w-full max-w-[34rem] px-5 py-6">
        <Link href="/" className="inline-flex items-center gap-2 text-small text-chalk-muted">
          <ArrowLeft aria-hidden className="h-4 w-4" />
          Back
        </Link>
        {error && <ErrorNotice error={error} className="mt-6" onRetry={() => void load()} />}
      </main>
    )
  }

  const deadline = pact.deadline ? relativeDeadline(pact.deadline) : null
  const meta = STATUS_META[pact.status]

  return (
    <>
      <main className="safe-top mx-auto w-full max-w-[34rem] px-5 pb-32">
        <header className="flex items-center justify-between gap-2 py-3">
          <Link
            href="/"
            aria-label="Back to your agreements"
            className="-ml-2 flex h-tap w-tap items-center justify-center rounded-full text-chalk-muted active:bg-white/10"
          >
            <ArrowLeft aria-hidden className="h-5 w-5" />
          </Link>
          <button
            type="button"
            onClick={() => setSheet('explain')}
            className="inline-flex items-center gap-1.5 rounded-pill border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[0.7rem] font-medium text-chalk-muted active:bg-white/[0.1]"
          >
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            Explain this PACT
          </button>
        </header>

        <motion.section
          className="flex flex-col items-center py-4 text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <PactSeal status={pact.status} digest={pact.termsDigest} size="md" />
          <h1 className="mt-4 text-balance text-title text-chalk">{pact.title}</h1>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
            <StatusPill status={pact.status} />
            {deadline && (
              <Tag tone={deadline.overdue ? 'rose' : deadline.soon ? 'amber' : 'neutral'}>{deadline.label}</Tag>
            )}
          </div>
          <p className="mt-2 text-small text-chalk-muted">{meta.blurb}</p>
          <Money minor={pact.totalAmountMinor} currency={pact.currency} size="xl" className="mt-4 text-gold-bright" />
          {pact.chain && (
            <p className="mt-1 text-[0.7rem] text-chalk-faint">
              on {EVM_CHAINS[pact.chain].name} · fees in {EVM_CHAINS[pact.chain].nativeSymbol}
            </p>
          )}
        </motion.section>

        {cannotPay && role === 'CLIENT' && <ErrorNotice error={cannotPay} className="mb-5" />}
        {error && <ErrorNotice error={error} className="mb-5" onRetry={() => void load()} />}

        {/* --- open issue ---------------------------------------------------------- */}
        {openDispute && (
          <section id="dispute" className="mb-7 scroll-mt-6">
            <SectionTitle>Open issue</SectionTitle>
            <div className="surface border-rose/30 bg-rose/[0.05] px-4 py-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-rose" />
                <div className="min-w-0">
                  <p className="text-small font-medium text-chalk">
                    {raisedByMe
                      ? DISPUTE_REASON_META[openDispute.reason].label
                      : DISPUTE_REASON_META[openDispute.reason].counterparty}
                  </p>
                  <p className="mt-1 text-[0.7rem] text-chalk-faint">
                    Raised by {raisedByMe ? 'you' : other?.displayName ?? 'the other side'} ·{' '}
                    {relativeTime(openDispute.createdAt)}
                  </p>
                </div>
              </div>

              <p className="mt-3.5 whitespace-pre-line text-small leading-relaxed text-chalk-muted">
                {openDispute.detail}
              </p>

              <div className="mt-4 flex gap-2.5">
                <Button fullWidth busy={busy} onClick={() => void closeDispute(openDispute.id, 'RESOLVED')}>
                  Mark resolved
                </Button>
                {raisedByMe && (
                  <Button
                    variant="secondary"
                    fullWidth
                    disabled={busy}
                    onClick={() => void closeDispute(openDispute.id, 'WITHDRAWN')}
                  >
                    Withdraw
                  </Button>
                )}
              </div>
              <p className="mt-2.5 text-[0.7rem] leading-relaxed text-chalk-faint">
                Closing this puts the agreement back in progress. PACT doesn’t decide who’s right, and nothing here
                moves or holds a payment.
              </p>
            </div>
          </section>
        )}

        {/* --- open proposal ------------------------------------------------------- */}
        {openProposal && (
          <section id="negotiation" className="mb-7 scroll-mt-6">
            <SectionTitle>Proposed changes</SectionTitle>
            <div className="surface border-violet/30 bg-violet/[0.05] px-4 py-4">
              <p className="text-small leading-relaxed text-chalk">{openProposal.message}</p>

              <div className="mt-3.5 space-y-2.5">
                {openProposal.changes.map((change) => (
                  <div key={change.id} className="rounded-xl border border-white/[0.07] bg-black/25 px-3.5 py-3">
                    <p className="text-micro uppercase tracking-wider text-chalk-faint">{change.label}</p>
                    <div className="mt-1.5 flex items-center gap-2.5">
                      <span className="min-w-0 flex-1 truncate text-small text-chalk-faint line-through decoration-white/30">
                        {change.originalValue || 'not set'}
                      </span>
                      <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-violet" />
                      <span className="min-w-0 flex-1 truncate text-right text-small font-medium text-chalk">
                        {change.proposedValue}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {normalizeAddress(openProposal.proposedBy) === normalizeAddress(me?.address ?? '') ? (
                <p className="mt-3.5 text-small text-chalk-muted">Waiting for {other?.displayName} to respond.</p>
              ) : (
                <div className="mt-4 flex gap-2.5">
                  <Button
                    fullWidth
                    busy={busy}
                    onClick={() => void answerProposal(openProposal.id, 'ACCEPTED')}
                  >
                    Accept changes
                  </Button>
                  <Button
                    variant="secondary"
                    fullWidth
                    disabled={busy}
                    onClick={() => void answerProposal(openProposal.id, 'DECLINED')}
                  >
                    Decline
                  </Button>
                </div>
              )}
              <p className="mt-2.5 text-[0.7rem] leading-relaxed text-chalk-faint">
                Accepting changes the terms, so you’ll both need to sign again.
              </p>
            </div>
          </section>
        )}

        {/* --- parties and signatures ---------------------------------------------- */}
        <section className="mb-7">
          <SectionTitle>Who signed</SectionTitle>
          <div className="surface divide-y divide-white/[0.06]">
            {pact.participants.map((participant) => (
              <div key={participant.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold',
                    participant.sealSignature ? 'bg-gold/15 text-gold-bright' : 'bg-white/[0.07] text-chalk-faint',
                  )}
                >
                  {participant.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-small font-medium text-chalk">
                    {participant.displayName}
                    {participant === self && <span className="ml-1.5 text-chalk-faint">(you)</span>}
                  </p>
                  <p className="text-[0.7rem] text-chalk-faint">
                    {participant.role === 'CLIENT' ? 'Paying' : 'Delivering'}
                  </p>
                </div>
                {participant.address ? (
                  participant.sealSignature ? (
                    <Tag tone="gold">Signed</Tag>
                  ) : (
                    <Tag tone="amber">Not signed</Tag>
                  )
                ) : (
                  <Tag tone="neutral">Not joined</Tag>
                )}
              </div>
            ))}
          </div>
          {other?.address && (
            <div className="mt-2 flex justify-end">
              <AddressChip address={other.address} />
            </div>
          )}
        </section>

        {/* --- terms ---------------------------------------------------------------- */}
        <section className="mb-7">
          <SectionTitle>Terms</SectionTitle>
          <dl className="surface divide-y divide-white/[0.06]">
            <Row label="Deliverable">{pact.deliverable}</Row>
            <Row label="Deadline">{pact.deadline ? formatLongDate(pact.deadline) : 'No deadline set'}</Row>
            <Row label="Payment">{pact.paymentCondition}</Row>
            <Row label="Reference">
              <span className="font-mono text-[0.7rem]">{pact.shortId}</span>
            </Row>
          </dl>

          {pact.specialTerms.length > 0 && (
            <ul className="surface mt-2.5 space-y-1.5 px-4 py-3">
              {pact.specialTerms.map((term, index) => (
                <li key={index} className="flex gap-2 text-small leading-relaxed text-chalk-muted">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-chalk-faint" />
                  {term}
                </li>
              ))}
            </ul>
          )}

          <Fingerprint digest={pact.termsDigest} className="mt-2.5" />
        </section>

        {/* --- milestones ----------------------------------------------------------- */}
        {pact.milestones.length > 0 && (
          <section className="mb-7">
            <SectionTitle>Milestones</SectionTitle>
            <ol className="space-y-2.5">
              {pact.milestones.map((milestone) => {
                const due = milestone.dueDate ? relativeDeadline(milestone.dueDate) : null
                const paid = milestone.status === 'PAID'

                return (
                  <li key={milestone.id} className={cn('surface px-4 py-3.5', paid && 'opacity-70')}>
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.7rem]',
                          paid ? 'bg-jade/15 text-jade' : 'bg-white/[0.07] text-chalk-muted',
                        )}
                      >
                        {paid ? '✓' : milestone.position}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 truncate text-small font-medium text-chalk">{milestone.title}</p>
                          <Money
                            minor={milestone.amountMinor}
                            currency={pact.currency}
                            size="sm"
                            className="shrink-0 text-chalk"
                          />
                        </div>
                        {milestone.description && (
                          <p className="mt-0.5 text-[0.7rem] leading-relaxed text-chalk-muted">{milestone.description}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <Tag tone={paid ? 'jade' : milestone.status === 'SUBMITTED' ? 'azure' : 'neutral'}>
                            {milestone.status.toLowerCase().replace('_', ' ')}
                          </Tag>
                          {due && (
                            <span
                              className={cn(
                                'text-[0.7rem]',
                                due.overdue ? 'text-rose' : due.soon ? 'text-amber' : 'text-chalk-faint',
                              )}
                            >
                              {due.label}
                            </span>
                          )}
                        </div>

                        {role === 'CLIENT' && !paid && ['ACTIVE', 'IN_PROGRESS', 'DELIVERED'].includes(pact.status) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="mt-2.5"
                            disabled={cannotPay !== null}
                            onClick={() => {
                              setPayTarget(milestone)
                              setSheet('pay')
                            }}
                          >
                            <Wallet aria-hidden className="h-3.5 w-3.5" />
                            Pay this step
                          </Button>
                        )}
                        {role === 'PROVIDER' && !paid && pact.status === 'IN_PROGRESS' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-2.5"
                            onClick={() => {
                              setPayTarget(milestone)
                              setSheet('deliver')
                            }}
                          >
                            Submit this step
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        {/* --- deliveries ----------------------------------------------------------- */}
        {pact.deliverables.length > 0 && (
          <section className="mb-7">
            <SectionTitle>Deliveries</SectionTitle>
            <div className="space-y-2.5">
              {pact.deliverables.map((deliverable) => (
                <div key={deliverable.id} className="surface px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-small leading-relaxed text-chalk">{deliverable.note}</p>
                    <Tag
                      tone={
                        deliverable.status === 'APPROVED'
                          ? 'jade'
                          : deliverable.status === 'CHANGES_REQUESTED'
                            ? 'amber'
                            : 'azure'
                      }
                    >
                      {deliverable.status.toLowerCase().replace('_', ' ')}
                    </Tag>
                  </div>

                  {deliverable.link && (
                    <a
                      href={deliverable.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-block break-all text-[0.7rem] font-medium text-azure-bright underline underline-offset-4"
                    >
                      {deliverable.link}
                    </a>
                  )}

                  {deliverable.reviewNote && (
                    <p className="mt-2 border-t border-white/[0.06] pt-2 text-[0.7rem] leading-relaxed text-chalk-muted">
                      {deliverable.reviewNote}
                    </p>
                  )}

                  {role === 'CLIENT' && deliverable.status === 'SUBMITTED' && (
                    <div className="mt-3 flex gap-2.5">
                      <Button size="sm" busy={busy} onClick={() => void reviewDelivery(deliverable.id, 'APPROVED')}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void reviewDelivery(deliverable.id, 'CHANGES_REQUESTED')}
                      >
                        Request changes
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* --- timeline ------------------------------------------------------------- */}
        <section className="mb-7">
          <SectionTitle>History</SectionTitle>
          <div className="surface px-4 py-4">
            <Timeline activities={pact.activities} />
          </div>
        </section>

        {/* --- secondary actions ---------------------------------------------------- */}
        <section className="space-y-2">
          {['DRAFT', 'PENDING', 'NEGOTIATING', 'ACTIVE', 'IN_PROGRESS'].includes(pact.status) && (
            <Button variant="secondary" fullWidth onClick={() => setSheet('negotiate')}>
              <MessageSquareReply aria-hidden className="h-4 w-4" />
              Propose changes
            </Button>
          )}
          {role === 'PROVIDER' && ['ACTIVE', 'IN_PROGRESS'].includes(pact.status) && (
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setPayTarget(null)
                setSheet('deliver')
              }}
            >
              <Package aria-hidden className="h-4 w-4" />
              Submit a delivery
            </Button>
          )}
          {!['COMPLETED', 'CANCELLED', 'DECLINED', 'DISPUTED'].includes(pact.status) && (
            <Button variant="ghost" fullWidth disabled={busy} onClick={() => setSheet('dispute')}>
              Raise an issue
            </Button>
          )}
        </section>
      </main>

      {primary && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[34rem] bg-gradient-to-t from-ink-900 via-ink-900/95 to-transparent px-5 pt-8">
          {primary.scrollTo ? (
            <Button
              size="lg"
              fullWidth
              onClick={() => document.getElementById(primary.scrollTo!)?.scrollIntoView({ behavior: 'smooth' })}
            >
              <primary.icon aria-hidden className="h-4 w-4" />
              {primary.label}
            </Button>
          ) : (
            <Button size="lg" fullWidth busy={busy} disabled={primary.disabled} onClick={primary.run}>
              <primary.icon aria-hidden className="h-4 w-4" />
              {primary.label}
            </Button>
          )}
        </div>
      )}

      <SealSheet open={sheet === 'seal'} onClose={() => setSheet(null)} pact={pact} onSealed={() => void load()} />
      <PaymentSheet
        open={sheet === 'pay'}
        onClose={() => setSheet(null)}
        pact={pact}
        milestone={payTarget}
        onSettled={() => void load()}
      />
      <DeliverySheet
        open={sheet === 'deliver'}
        onClose={() => setSheet(null)}
        pact={pact}
        milestone={payTarget}
        onSubmitted={() => void load()}
      />
      <NegotiationSheet
        open={sheet === 'negotiate'}
        onClose={() => setSheet(null)}
        pact={pact}
        onProposed={() => void load()}
      />
      <ExplainSheet open={sheet === 'explain'} onClose={() => setSheet(null)} pact={pact} />
      <DisputeSheet
        open={sheet === 'dispute'}
        onClose={() => setSheet(null)}
        pact={pact}
        onRaised={() => void load()}
      />
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 pt-px text-small text-chalk-faint">{label}</dt>
      <dd className="min-w-0 flex-1 text-right text-small leading-relaxed text-chalk">{children}</dd>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="safe-top mx-auto w-full max-w-[34rem] space-y-6 px-5 py-6">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-24 w-24 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="h-28" />
      <Skeleton className="h-40" />
      <Skeleton className="h-56" />
    </div>
  )
}

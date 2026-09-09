'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Copy, ShieldCheck } from 'lucide-react'
import { api, toUserFacing } from '@/lib/client/api'
import { formatWithCurrency } from '@/lib/pact/money'
import { formatLongDate } from '@/lib/format'
import { STATUS_META } from '@/lib/pact/state'
import { categoryMeta, roleLabel, usesPayment } from '@/lib/pact/categories'
import { PactSeal } from '@/components/seal/PactSeal'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, Fingerprint, SectionTitle, Skeleton, StatusPill } from '@/components/ui/Bits'
import { cn } from '@/lib/cn'
import type { VerificationRecord } from '@/lib/pact/types'
import type { UserFacingError } from '@/lib/errors'

/**
 * The public record.
 *
 * Reachable without a wallet, without a session, and without being a party — which makes
 * it the only screen in PACT written for someone who has no reason to trust PACT. That
 * shapes everything about it.
 *
 * The claim it makes is narrow and it is made precisely: these terms produced this
 * fingerprint, and these two keys signed that fingerprint on these dates. It does not say
 * the work was good, that the money arrived, or that anyone was honest — PACT cannot know
 * any of that, so the page does not imply it. The "what this does and doesn't prove"
 * panel is not a disclaimer bolted on at the end; it is the point of the page.
 */
export default function VerifyPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = use(params)
  const [record, setRecord] = useState<VerificationRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<UserFacingError | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api<{ record: VerificationRecord }>(`/api/verify/${shortId}`)
      setRecord(result.record)
      setError(null)
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setLoading(false)
    }
  }, [shortId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <main className="safe-top mx-auto w-full max-w-[34rem] space-y-4 px-5 py-10">
        <Skeleton className="mx-auto h-28 w-28 rounded-full" />
        <Skeleton className="mx-auto h-7 w-56" />
        <Skeleton className="h-40" />
      </main>
    )
  }

  if (error || !record) {
    return (
      <main className="safe-top mx-auto flex min-h-screen w-full max-w-[34rem] flex-col justify-center px-5 py-10">
        <div className="surface px-5 py-8 text-center">
          <h1 className="text-title text-chalk">Nothing to show</h1>
          <p className="mt-2 text-small leading-relaxed text-chalk-muted">
            No public record matches <span className="tabular text-chalk">{shortId.toUpperCase()}</span>. It may never
            have existed, or the people involved may have kept it private — PACT can’t tell you which.
          </p>
          <Link href="/" className="mt-5 inline-block">
            <Button variant="secondary">Go to PACT</Button>
          </Link>
        </div>
      </main>
    )
  }

  const meta = STATUS_META[record.status]
  const bothSigned = record.parties.length > 0 && record.parties.every((party) => party.sealSignature !== null)

  return (
    <main className="safe-top mx-auto w-full max-w-[34rem] px-5 pb-16">
      <motion.header
        className="flex flex-col items-center py-8 text-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <PactSeal status={record.status} digest={record.termsDigest} size="lg" />
        <h1 className="mt-5 text-display text-chalk">{record.title}</h1>
        <div className="mt-3 flex items-center gap-2">
          <StatusPill status={record.status} />
        </div>
        <p className="mt-2 text-small text-chalk-muted">{meta.blurb}</p>
        {usesPayment(record.category) ? (
          <p className="tabular mt-4 text-title text-gold-bright">
            {formatWithCurrency(record.totalAmountMinor, record.currency)}
          </p>
        ) : (
          <p className="mt-4 text-small text-chalk-faint">{categoryMeta(record.category).label} · no money involved</p>
        )}
      </motion.header>

      {/* The claim, stated exactly. */}
      <section className="mb-7">
        <div
          className={cn(
            'surface px-4 py-4',
            bothSigned ? 'border-jade/30 bg-jade/[0.05]' : 'border-amber/25 bg-amber/[0.05]',
          )}
        >
          <div className="flex items-start gap-2.5">
            <ShieldCheck
              aria-hidden
              className={cn('mt-0.5 h-4 w-4 shrink-0', bothSigned ? 'text-jade' : 'text-amber')}
            />
            <div>
              <h2 className="text-small font-semibold text-chalk">
                {bothSigned ? 'Both parties signed these terms' : 'Not yet signed by both parties'}
              </h2>
              <p className="mt-1 text-[0.7rem] leading-relaxed text-chalk-muted">
                {bothSigned
                  ? 'Each signature below was made over the fingerprint of the exact terms on this page. Changing any term would produce a different fingerprint, and these signatures would no longer match it.'
                  : 'One side has not signed yet, so these terms are not locked. They can still change.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-7">
        <SectionTitle>Parties</SectionTitle>
        <div className="surface divide-y divide-white/[0.06]">
          {record.parties.map((party) => (
            <div key={party.role} className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-small font-medium text-chalk">{party.displayName || 'Unnamed'}</p>
                  <p className="text-[0.7rem] text-chalk-faint">
                    {roleLabel(record.category, party.role)}
                    {party.addressPreview && <span className="tabular"> · {party.addressPreview}</span>}
                  </p>
                </div>
                {party.sealedAt ? (
                  <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-gold-bright">
                    Signed
                  </span>
                ) : (
                  <span className="shrink-0 text-[0.65rem] uppercase tracking-wider text-chalk-faint">Not signed</span>
                )}
              </div>
              {party.sealedAt && (
                <p className="mt-1.5 text-[0.7rem] text-chalk-faint">Signed {formatLongDate(party.sealedAt)}</p>
              )}
              {party.sealPublicKey && <KeyRow label="Public key" value={party.sealPublicKey} />}
              {party.sealSignature && <KeyRow label="Signature" value={party.sealSignature} />}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-7">
        <SectionTitle>Terms fingerprint</SectionTitle>
        <div className="surface px-4 py-4">
          <Fingerprint digest={record.termsDigest} />
          <p className="mt-3 text-[0.7rem] leading-relaxed text-chalk-faint">
            A Blake2b digest of the exact agreed terms. It is what both signatures above were made over.
          </p>
        </div>
      </section>

      {record.milestones.length > 0 && (
        <section className="mb-7">
          <SectionTitle>Milestones</SectionTitle>
          <div className="surface divide-y divide-white/[0.06]">
            {record.milestones.map((milestone) => (
              <div key={milestone.position} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-small text-chalk">{milestone.title}</p>
                  <p className="text-[0.7rem] text-chalk-faint">
                    {milestone.status.toLowerCase().replace('_', ' ')}
                    {milestone.dueDate && ` · due ${formatLongDate(milestone.dueDate)}`}
                  </p>
                </div>
                <span className="tabular shrink-0 text-small font-semibold text-chalk">
                  {formatWithCurrency(milestone.amountMinor, record.currency)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-7">
        <SectionTitle>Record</SectionTitle>
        <div className="surface divide-y divide-white/[0.06]">
          <Row label="Reference" value={record.shortId} mono />
          <Row label="Created" value={formatLongDate(record.createdAt)} />
          <Row label="Last updated" value={formatLongDate(record.updatedAt)} />
          {record.deadline && <Row label="Deadline" value={formatLongDate(record.deadline)} />}
          {usesPayment(record.category) && (
            <Row label="Payments recorded" value={`${record.paymentsConfirmed} confirmed`} />
          )}
        </div>
      </section>

      {/* Not a footnote. The most important thing on the page. */}
      <section className="mb-8">
        <div className="surface-quiet px-4 py-4">
          <h2 className="text-micro font-semibold uppercase tracking-[0.14em] text-chalk-faint">
            What this proves, and what it doesn’t
          </h2>
          <div className="mt-2.5 space-y-2.5">
            <div>
              <p className="text-[0.7rem] font-semibold text-chalk">It does show</p>
              <p className="text-[0.7rem] leading-relaxed text-chalk-muted">
                That these exact terms produced this fingerprint, and that the keys listed above signed it on the dates
                shown. Anyone can check that independently — the signatures and public keys are printed in full.
              </p>
            </div>
            <div>
              <p className="text-[0.7rem] font-semibold text-chalk">It does not show</p>
              <p className="text-[0.7rem] leading-relaxed text-chalk-muted">
                Whether the work was any good, whether either person behaved well, or that money actually changed
                hands. Payments are counted here, not verified on chain by this page. PACT never held any funds and
                cannot reverse anything.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="text-center">
        <Link href="/" className="inline-flex items-center gap-1.5 text-small text-chalk-muted underline underline-offset-4">
          Make an agreement like this
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>
    </main>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-small text-chalk-muted">{label}</span>
      <span className={cn('text-small text-chalk', mono && 'tabular font-medium')}>{value}</span>
    </div>
  )
}

/** Full hex, wrapped and copyable — a signature nobody can read is a signature nobody can check. */
function KeyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard can be unavailable in an embedded WebView; the text is on screen anyway.
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.65rem] uppercase tracking-wider text-chalk-faint">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-chalk-faint active:bg-white/10"
        >
          {copied ? <Check aria-hidden className="h-3 w-3 text-jade" /> : <Copy aria-hidden className="h-3 w-3" />}
        </button>
      </div>
      <p className="tabular mt-1 break-all text-[0.65rem] leading-relaxed text-chalk-muted">{value}</p>
    </div>
  )
}

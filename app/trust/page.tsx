'use client'

import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { motion } from 'framer-motion'
import { useSession } from '@/lib/client/session'
import { formatAmount } from '@/lib/pact/money'
import { formatLongDate } from '@/lib/format'
import { AddressChip, EmptyState, SectionTitle, Skeleton } from '@/components/ui/Bits'
import { cn } from '@/lib/cn'
import type { Currency } from '@/lib/pact/types'

/**
 * Trust profile.
 *
 * Every number here is a count of something PACT can evidence: an agreement that reached
 * COMPLETED, a payment with a stored transaction reference, a delivery timestamp compared
 * against an agreed due date. There is no score, no rating, and nothing derived from an
 * AI's opinion of anyone.
 *
 * The on-time figure is deliberately shown as "4 of 5" rather than "80%". A percentage
 * with a hidden denominator is the oldest trick in reputation design — 100% from one
 * delivery reads identically to 100% from fifty, and only one of those means anything.
 */

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="surface px-4 py-3.5">
      <p className="text-micro uppercase tracking-wider text-chalk-faint">{label}</p>
      <p className="tabular mt-1.5 text-title text-chalk">{value}</p>
      {sub && <p className="mt-0.5 text-[0.7rem] text-chalk-faint">{sub}</p>}
    </div>
  )
}

export default function TrustPage() {
  const { me, loading } = useSession()

  if (loading) {
    return (
      <main className="safe-top mx-auto w-full max-w-[34rem] space-y-4 px-5 py-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </main>
    )
  }

  const trust = me?.trust
  const hasHistory = trust != null && (trust.pactsCompleted > 0 || trust.pactsActive > 0 || trust.deliveredTotal > 0)

  return (
    <main className="safe-top mx-auto w-full max-w-[34rem] px-5 pb-10">
      <header className="flex items-center gap-2 py-3">
        <Link
          href="/"
          aria-label="Back"
          className="-ml-2 flex h-tap w-tap items-center justify-center rounded-full text-chalk-muted active:bg-white/10"
        >
          <ArrowLeft aria-hidden className="h-5 w-5" />
        </Link>
        <h1 className="text-heading text-chalk">Trust profile</h1>
      </header>

      <motion.section
        className="flex flex-col items-center py-6 text-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/30 bg-gold/10">
          <ShieldCheck aria-hidden className="h-7 w-7 text-gold-bright" />
        </div>
        <h2 className="mt-4 text-title text-chalk">{me?.displayName || 'You'}</h2>
        {me?.address && <AddressChip address={me.address} full className="mt-2" />}
        {trust?.firstSeenAt && (
          <p className="mt-2 text-[0.7rem] text-chalk-faint">On PACT since {formatLongDate(trust.firstSeenAt)}</p>
        )}
      </motion.section>

      {!hasHistory ? (
        <div className="surface">
          <EmptyState
            title="Nothing to show yet"
            body="Your record builds as you complete agreements. PACT only counts things it can prove — signed terms, recorded payments, delivery timestamps."
          />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2.5">
            <Stat label="Completed" value={String(trust.pactsCompleted)} sub="agreements finished" />
            <Stat label="Active" value={String(trust.pactsActive)} sub="running now" />
            <Stat
              label="Payments"
              value={String(trust.paymentsConfirmed)}
              sub="with a transaction on record"
            />
            <Stat
              label="Cancelled"
              value={String(trust.pactsCancelled)}
              sub={trust.pactsCancelled === 0 ? 'none' : 'called off or declined'}
            />
          </section>

          <section className="mt-6">
            <SectionTitle>Delivered on time</SectionTitle>
            <div className="surface px-4 py-4">
              {trust.deliveredTotal === 0 ? (
                <p className="text-small leading-relaxed text-chalk-muted">
                  You haven’t delivered on an agreement yet, so there’s nothing to measure. This only counts work you
                  delivered as the provider.
                </p>
              ) : (
                <>
                  <p className="tabular text-title text-chalk">
                    {trust.deliveredOnTime} <span className="text-chalk-faint">of</span> {trust.deliveredTotal}
                  </p>
                  <div
                    className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]"
                    role="img"
                    aria-label={`${trust.deliveredOnTime} of ${trust.deliveredTotal} deliveries on time`}
                  >
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-700 ease-entrance',
                        trust.deliveredOnTime === trust.deliveredTotal ? 'bg-jade' : 'bg-amber',
                      )}
                      style={{ width: `${(trust.deliveredOnTime / trust.deliveredTotal) * 100}%` }}
                    />
                  </div>
                  <p className="mt-2.5 text-[0.7rem] leading-relaxed text-chalk-faint">
                    Counted against the due date on each approved delivery. A small number of deliveries is a small
                    amount of evidence — PACT shows you the count so you can judge that yourself.
                  </p>
                </>
              )}
            </div>
          </section>

          {Object.keys(trust.totalValueByCurrency).length > 0 && (
            <section className="mt-6">
              <SectionTitle>Value settled</SectionTitle>
              <div className="surface divide-y divide-white/[0.06]">
                {Object.entries(trust.totalValueByCurrency).map(([currency, minor]) => (
                  <div key={currency} className="flex items-center justify-between px-4 py-3">
                    <span className="text-small text-chalk-muted">{currency}</span>
                    <span className="tabular text-small font-semibold text-chalk">
                      {formatAmount(minor as string, currency as Currency)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 px-1 text-[0.7rem] leading-relaxed text-chalk-faint">
                Only payments with a transaction reference are counted. Amounts are kept separate by currency — adding
                NIM to USDT would produce a number that means nothing.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  )
}

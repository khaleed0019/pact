'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, ShieldOff } from 'lucide-react'
import { api, toUserFacing } from '@/lib/client/api'
import { formatAmount } from '@/lib/pact/money'
import { ErrorNotice, SectionTitle, Skeleton } from '@/components/ui/Bits'
import type { Currency, ProductStats } from '@/lib/pact/types'
import type { UserFacingError } from '@/lib/errors'

/**
 * Usage, in the open.
 *
 * Two rules shape this screen. Every number is a count of something that happened, and
 * every number shows its denominator where one exists — "12 of 30 signed" rather than a
 * 40% that hides how small the sample is. That is the same rule the trust profile
 * follows, for the same reason: a percentage with the count removed is the oldest trick
 * in metrics design.
 */
export default function StatsPage() {
  const [stats, setStats] = useState<ProductStats | null>(null)
  const [error, setError] = useState<UserFacingError | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await api<{ stats: ProductStats }>('/api/stats')
      setStats(result.stats)
      setError(null)
    } catch (cause) {
      setError(toUserFacing(cause))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="safe-top mx-auto w-full max-w-[34rem] px-5 pb-16">
      <header className="flex items-center gap-2 py-3">
        <Link
          href="/"
          aria-label="Back"
          className="-ml-2 flex h-tap w-tap items-center justify-center rounded-full text-chalk-muted active:bg-white/10"
        >
          <ArrowLeft aria-hidden className="h-5 w-5" />
        </Link>
        <h1 className="text-heading text-chalk">Usage</h1>
      </header>

      {error && <ErrorNotice error={error} className="mb-5" onRetry={() => void load()} />}

      {!stats && !error && (
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {stats && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <section className="grid grid-cols-2 gap-2.5">
            <Stat label="Agreements" value={stats.pactsCreated} sub="created in total" />
            <Stat label="People" value={stats.participants} sub="party to at least one" />
            <Stat
              label="Signed"
              value={stats.pactsSealed}
              sub={`of ${stats.pactsCreated} — both sides`}
            />
            <Stat label="Completed" value={stats.pactsCompleted} sub={`of ${stats.pactsCreated}`} />
          </section>

          <section className="mt-6">
            <SectionTitle>Invitations</SectionTitle>
            <div className="surface divide-y divide-white/[0.06]">
              <Row label="Sent" value={String(stats.invitationsSent)} />
              <Row
                label="Accepted"
                value={
                  stats.invitationsSent > 0
                    ? `${stats.invitationsAccepted} of ${stats.invitationsSent}`
                    : 'none yet'
                }
              />
            </div>
          </section>

          <section className="mt-6">
            <SectionTitle>Payments</SectionTitle>
            <div className="surface divide-y divide-white/[0.06]">
              <Row label="Confirmed" value={String(stats.paymentsConfirmed)} />
              {Object.entries(stats.valueByCurrency).map(([currency, minor]) => (
                <Row key={currency} label={`Settled in ${currency}`} value={formatAmount(minor, currency as Currency)} />
              ))}
            </div>
            <p className="mt-2 px-1 text-[0.7rem] leading-relaxed text-chalk-faint">
              Only payments carrying a transaction reference are counted, and currencies are never added together —
              a single figure mixing NIM and USDT would mean nothing.
            </p>
          </section>

          <section className="mt-6">
            <SectionTitle>Everything else</SectionTitle>
            <div className="surface divide-y divide-white/[0.06]">
              <Row label="Published records" value={String(stats.publicRecords)} />
              <Row label="Issues raised" value={String(stats.disputesRaised)} />
              <Row
                label="Issues resolved"
                value={stats.disputesRaised > 0 ? `${stats.disputesResolved} of ${stats.disputesRaised}` : 'none raised'}
              />
            </div>
          </section>

          <section className="mt-7">
            <div className="surface-quiet flex items-start gap-2.5 px-4 py-3.5">
              <ShieldOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-chalk-faint" />
              <p className="text-[0.7rem] leading-relaxed text-chalk-muted">
                <span className="font-medium text-chalk">Nothing here comes from tracking.</span> PACT records no page
                views, no sessions, and nothing about what any individual did. Every figure above is a count over
                agreements that already exist, which is why this page is open rather than hidden behind a login.
              </p>
            </div>
          </section>
        </motion.div>
      )}
    </main>
  )
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="surface px-4 py-3.5">
      <p className="text-micro uppercase tracking-wider text-chalk-faint">{label}</p>
      <p className="tabular mt-1.5 text-title text-chalk">{value}</p>
      <p className="mt-0.5 text-[0.7rem] text-chalk-faint">{sub}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-small text-chalk-muted">{label}</span>
      <span className="tabular text-small font-medium text-chalk">{value}</span>
    </div>
  )
}

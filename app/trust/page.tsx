'use client'

import { useState } from 'react'
import { Check, Pencil, ShieldCheck, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useSession } from '@/lib/client/session'
import { api, toUserFacing } from '@/lib/client/api'
import { formatAmount } from '@/lib/pact/money'
import { formatLongDate } from '@/lib/format'
import { TabBar, TAB_BAR_SPACER } from '@/components/nav/TabBar'
import { AddressChip, EmptyState, SectionTitle, Skeleton } from '@/components/ui/Bits'
import { TextInput } from '@/components/ui/Field'
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

/**
 * The one field on this page that isn't a count of what already happened.
 *
 * Everything else here is derived and read-only by design — this is the exception,
 * because a counterparty needs to see *some* name before any pact exists to derive one
 * from. Saves straight to `pact.profiles`, which every future pact's participant row
 * falls back to.
 */
function DisplayNameEditor({ name, onSaved }: { name: string; onSaved: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!editing) {
    return (
      <div className="mt-4 flex items-center gap-1.5">
        <h2 className="text-title text-chalk">{name || 'You'}</h2>
        <button
          type="button"
          onClick={() => {
            setDraft(name)
            setError(null)
            setEditing(true)
          }}
          aria-label="Edit your display name"
          className="flex h-8 w-8 items-center justify-center rounded-full text-chalk-faint transition-colors active:bg-white/10"
        >
          <Pencil aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  const save = async () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setError('Enter a name — this is what counterparties see.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api('/api/me', { method: 'PATCH', body: { displayName: trimmed } })
      onSaved(trimmed)
      setEditing(false)
    } catch (cause) {
      setError(toUserFacing(cause).body)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 w-full max-w-[16rem] text-left">
      <div className="flex items-center gap-2">
        <TextInput
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') setEditing(false)
          }}
          maxLength={80}
          placeholder="e.g. Alex"
          error={Boolean(error)}
          className="py-2 text-center text-title"
          disabled={saving}
        />
      </div>
      <div className="mt-2 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="flex h-8 w-8 items-center justify-center rounded-full text-chalk-faint transition-colors active:bg-white/10"
          aria-label="Cancel"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/15 text-gold-bright transition-colors active:bg-gold/25 disabled:opacity-50"
          aria-label="Save"
        >
          <Check aria-hidden className="h-4 w-4" />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-center text-[0.7rem] leading-relaxed text-rose">
          {error}
        </p>
      )}
    </div>
  )
}

export default function TrustPage() {
  const { me, loading, refresh } = useSession()

  if (loading) {
    return (
      <main className={cn('safe-top mx-auto w-full max-w-[34rem] space-y-4 px-5 py-6', TAB_BAR_SPACER)}>
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
    <>
      <main className={cn('safe-top mx-auto w-full max-w-[34rem] px-5', TAB_BAR_SPACER)}>
      <header className="py-4">
        <h1 className="text-display text-chalk">You</h1>
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
        <DisplayNameEditor name={trust?.displayName ?? ''} onSaved={() => void refresh()} />
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
      <TabBar />
    </>
  )
}

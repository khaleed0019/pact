'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, CalendarClock, FileText, Plus, ShieldCheck, Wallet } from 'lucide-react'
import { useSession } from '@/lib/client/session'
import { deriveInsights, sortForDashboard } from '@/lib/pact/insights'
import { formatAmount } from '@/lib/pact/money'
import { greeting, relativeDeadline } from '@/lib/format'
import { PactCard } from '@/components/pact/PactCard'
import { Button } from '@/components/ui/Button'
import { EmptyState, SectionTitle, Skeleton } from '@/components/ui/Bits'
import { cn } from '@/lib/cn'

/**
 * The Command Center.
 *
 * Target: a user understands their whole situation within about ten seconds of opening
 * the app. That means the four numbers at the top are not vanity metrics — each one is
 * chosen because it maps to a decision:
 *
 *   Active      → is anything running?
 *   Value       → how much is riding on it?
 *   Due soon    → do I need to move this week?
 *   Attention   → is anyone waiting on *me* right now?
 *
 * "Attention" is the only one that ever turns gold, so the eye has exactly one place to
 * land when something is wrong.
 */

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'neutral',
  href,
}: {
  icon: typeof FileText
  label: string
  value: string
  sub?: string
  tone?: 'neutral' | 'alert'
  href?: string
}) {
  const content = (
    <div
      className={cn(
        'surface h-full px-3.5 py-3',
        tone === 'alert' && 'border-gold/35 bg-gold/[0.07]',
        href && 'transition-transform duration-150 active:scale-[0.98]',
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon aria-hidden className={cn('h-3.5 w-3.5', tone === 'alert' ? 'text-gold-bright' : 'text-chalk-faint')} />
        <span className="text-micro uppercase tracking-wider text-chalk-faint">{label}</span>
      </div>
      <p className={cn('tabular mt-1.5 text-title', tone === 'alert' ? 'text-gold-bright' : 'text-chalk')}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[0.7rem] text-chalk-faint">{sub}</p>}
    </div>
  )

  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 px-5 py-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[4.75rem]" />
        ))}
      </div>
      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[6.5rem]" />
        ))}
      </div>
    </div>
  )
}

export function CommandCenter() {
  const { me } = useSession()

  const pacts = useMemo(() => me?.pacts ?? [], [me?.pacts])
  const address = me?.address ?? ''

  const insights = useMemo(() => deriveInsights(pacts, address), [pacts, address])
  const sorted = useMemo(() => sortForDashboard(pacts, address), [pacts, address])
  const attentionFor = useMemo(
    () => new Map(insights.needsAttention.map((entry) => [entry.pact.id, entry.reason])),
    [insights.needsAttention],
  )

  const headlineValue = insights.totalValue[0]
  const upcomingPayments = sorted.filter(
    (p) => ['ACTIVE', 'IN_PROGRESS', 'DELIVERED'].includes(p.status) && p.milestones.some((m) => m.status !== 'PAID'),
  )

  return (
    <main className="mx-auto w-full max-w-[34rem] pb-28">
      <header className="safe-top px-5 pb-5 pt-4">
        <p className="text-small text-chalk-muted">{greeting()},</p>
        <h1 className="mt-0.5 text-display text-chalk">{me?.displayName || 'there'}</h1>
      </header>

      {/*
        Each tile animates itself with an explicit delay rather than through parent
        variant orchestration. The variant version left the third and fourth tiles stuck
        at opacity 0 — the parent had no matching `hidden` variant, so the stagger never
        propagated past the first two. Explicit delays cannot fail that way.
      */}
      <section className="grid grid-cols-2 gap-2.5 px-5">
        {[
          <StatTile key="a" icon={FileText} label="Active" value={String(insights.activeCount)} sub="agreements running" />,
          <StatTile
            key="b"
            icon={Wallet}
            label="Total value"
            value={headlineValue ? formatAmount(headlineValue.minor, headlineValue.currency) : '0'}
            sub={
              headlineValue
                ? insights.totalValue.length > 1
                  ? `${headlineValue.currency} · +${insights.totalValue.length - 1} more`
                  : headlineValue.currency
                : 'nothing running'
            }
          />,
          <StatTile
            key="c"
            icon={CalendarClock}
            label="Due this week"
            value={String(insights.dueThisWeek.length)}
            sub={insights.overdue.length > 0 ? `${insights.overdue.length} overdue` : 'on track'}
          />,
          <StatTile
            key="d"
            icon={AlertCircle}
            label="Needs you"
            value={String(insights.needsAttention.length)}
            sub={insights.needsAttention.length > 0 ? insights.needsAttention[0].reason : 'nothing waiting'}
            tone={insights.needsAttention.length > 0 ? 'alert' : 'neutral'}
          />,
        ].map((tile, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {tile}
          </motion.div>
        ))}
      </section>

      {insights.needsAttention.length > 0 && (
        <section className="mt-7 px-5">
          <SectionTitle>Waiting on you</SectionTitle>
          <div className="space-y-2.5">
            {insights.needsAttention.map(({ pact, reason }) => (
              <PactCard key={pact.id} pact={pact} viewerAddress={address} reason={reason} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-7 px-5">
        <SectionTitle
          action={
            pacts.length > 0 ? (
              <Link href="/trust" className="text-[0.7rem] font-medium text-chalk-muted underline underline-offset-4">
                Trust profile
              </Link>
            ) : undefined
          }
        >
          Your agreements
        </SectionTitle>

        {pacts.length === 0 ? (
          <div className="surface">
            <EmptyState
              icon={<ShieldCheck className="h-8 w-8" />}
              title="No agreements yet"
              body="Describe a deal in your own words and PACT will turn it into terms both sides can sign."
              action={
                <Link href="/new">
                  <Button>
                    <Plus aria-hidden className="h-4 w-4" />
                    Create a PACT
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            {sorted
              .filter((pact) => !attentionFor.has(pact.id))
              .map((pact) => (
                <PactCard key={pact.id} pact={pact} viewerAddress={address} />
              ))}
          </div>
        )}
      </section>

      {upcomingPayments.length > 0 && (
        <section className="mt-7 px-5">
          <SectionTitle>Upcoming payments</SectionTitle>
          <div className="surface divide-y divide-white/[0.06]">
            {upcomingPayments.slice(0, 4).map((pact) => {
              const next = pact.milestones.find((m) => m.status !== 'PAID')
              if (!next) return null
              const due = next.dueDate ? relativeDeadline(next.dueDate) : null
              return (
                <Link key={pact.id} href={`/p/${pact.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-white/[0.03]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small font-medium text-chalk">{next.title}</p>
                    <p className="truncate text-[0.7rem] text-chalk-faint">
                      {pact.title}
                      {due ? ` · ${due.label}` : ''}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-small font-semibold text-chalk">
                    {formatAmount(next.amountMinor, pact.currency)}
                    <span className="ml-1 font-medium text-chalk-faint">{pact.currency}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Primary action pinned in the thumb zone, above the home indicator. */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[34rem] bg-gradient-to-t from-ink-900 via-ink-900/95 to-transparent px-5 pt-8">
        <Link href="/new" className="block">
          <Button size="lg" fullWidth>
            <Plus aria-hidden className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
            Create a PACT
          </Button>
        </Link>
      </div>
    </main>
  )
}

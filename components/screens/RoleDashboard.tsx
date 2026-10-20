'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { api, toUserFacing } from '@/lib/client/api'
import { formatWithCurrency } from '@/lib/pact/money'
import { relativeDeadline } from '@/lib/format'
import { ErrorNotice, SectionTitle, Skeleton } from '@/components/ui/Bits'
import { Button } from '@/components/ui/Button'
import type { ActionItem, Amounts, BrandDashboard, ContributorDashboard } from '@/lib/campaigns/dashboard'
import type { Currency } from '@/lib/pact/types'
import type { UserFacingError } from '@/lib/errors'
import { cn } from '@/lib/cn'

type Data = BrandDashboard | ContributorDashboard | { role: null }

/** "120 NIM · 25 USDT", or a dash. Currencies are never added together. */
function money(amounts: Amounts): string {
  const parts = (Object.entries(amounts) as Array<[Currency, string]>)
    .filter(([, v]) => v !== '0')
    .map(([c, v]) => formatWithCurrency(v, c))
  return parts.length ? parts.join(' · ') : '—'
}

/**
 * The role dashboard at the top of Home.
 *
 * A short row of figures, each one a count or sum the server computed from records (see
 * lib/campaigns/dashboard.ts), then the things waiting on you. Figures sit on solid
 * surfaces — this is money, it should read crisply — and the only colour that means
 * "arrived" is on the verified figure.
 */
export function RoleDashboard() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<UserFacingError | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api<Data>('/api/dashboard'))
      setError(null)
    } catch (cause) {
      setError(toUserFacing(cause))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (error) return <ErrorNotice error={error} onRetry={() => void load()} className="mx-5" />
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-2.5 px-5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[5.5rem]" />
        ))}
      </div>
    )
  }
  if (data.role === null) return null
  return data.role === 'BRAND' ? <Brand d={data} /> : <Contributor d={data} />
}

function Brand({ d }: { d: BrandDashboard }) {
  const nothingYet = d.liveCampaigns === 0 && d.people === 0
  return (
    <section className="px-5" aria-label="Brand dashboard">
      {nothingYet ? (
        <StartCard
          title="Post your first campaign"
          body="Set a reward, say what you need, and choose how many people can take it up. You pay each person from your wallet once you approve their work."
          href="/campaigns/new"
          action="Post work"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <Figure i={0} label="Live campaigns" value={String(d.liveCampaigns)} sub={`${d.openSpots} open spots`} href="/campaigns" />
          <Figure i={1} label="People working" value={String(d.people)} sub={`${d.reviewQueue.length} to review`} tone={d.reviewQueue.length ? 'alert' : undefined} />
          <Figure i={2} label="Agreed to pay" value={money(d.agreed)} sub={`of ${money(d.potential)} possible`} small />
          <Figure i={3} label="Verified paid" value={money(d.verified)} sub={pendingSub(d.pending)} tone="verified" small />
        </div>
      )}
      <Queue title="Review their work" items={d.reviewQueue} />
      <Queue title="Waiting for your signature" items={d.awaitingSignature} />
      <p className="mt-3 px-1 text-[0.68rem] leading-relaxed text-chalk-faint">
        Budgets are what you’ve agreed to pay, not money set aside. Paid counts only once the network confirms it.
      </p>
    </section>
  )
}

function Contributor({ d }: { d: ContributorDashboard }) {
  const due = d.nextDeadline ? relativeDeadline(d.nextDeadline.deadline) : null
  return (
    <section className="px-5" aria-label="Contributor dashboard">
      {d.activeWork === 0 && d.openOpportunities > 0 ? (
        <StartCard
          title={`${d.openOpportunities} paid ${d.openOpportunities === 1 ? 'campaign is' : 'campaigns are'} open`}
          body="Pick one, read the terms, and take it up. You’ll both sign before you start, and you’re paid in Nimiq Pay once the brand approves."
          href="/campaigns"
          action="Find work"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <Figure i={0} label="Open to take up" value={String(d.openOpportunities)} sub="campaigns with spots" href="/campaigns" />
          <Figure
            i={1}
            label="Active work"
            value={String(d.activeWork)}
            sub={due && d.nextDeadline ? `next ${due.label}` : 'no deadlines'}
            tone={due?.overdue || due?.soon ? 'alert' : undefined}
            href={d.nextDeadline ? `/p/${d.nextDeadline.pactId}` : undefined}
          />
          <Figure i={2} label="Approved, unpaid" value={String(d.approvedUnpaid.length)} sub={pendingSub(d.pending)} />
          <Figure i={3} label="Verified earnings" value={money(d.verified)} sub="confirmed on the network" tone="verified" small />
        </div>
      )}
      <Queue title="Changes requested" items={d.revisions} />
      <Queue title="Waiting for review" items={d.awaitingReview} />
      <Queue title="Approved — waiting for payment" items={d.approvedUnpaid} />
    </section>
  )
}

function pendingSub(pending: Amounts): string {
  const v = money(pending)
  return v === '—' ? 'nothing pending' : `${v} sent, confirming`
}

function Figure({
  i,
  label,
  value,
  sub,
  href,
  tone,
  small,
}: {
  i: number
  label: string
  value: string
  sub: string
  href?: string
  tone?: 'alert' | 'verified'
  small?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const body = (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className={cn('surface h-full px-3.5 py-3', href && 'transition-transform duration-150 active:scale-[0.98]')}
    >
      <p className="text-[0.68rem] font-medium uppercase tracking-wider text-chalk-faint">{label}</p>
      <p
        className={cn(
          'tabular mt-1.5 break-words',
          small ? 'text-heading' : 'text-title',
          tone === 'alert' ? 'text-gold-bright' : tone === 'verified' ? 'text-jade' : 'text-chalk',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[0.68rem] text-chalk-muted">{sub}</p>
    </motion.div>
  )
  return href ? (
    <Link href={href} className="focus-ring block h-full rounded-card">
      {body}
    </Link>
  ) : (
    body
  )
}

function StartCard({ title, body, href, action }: { title: string; body: string; href: string; action: string }) {
  return (
    <div className="surface relative overflow-hidden px-4 py-4">
      <span
        aria-hidden
        className="absolute inset-x-8 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(247,201,72,0.5), transparent)' }}
      />
      <p className="text-heading text-chalk">{title}</p>
      <p className="mt-1 text-small leading-relaxed text-chalk-muted">{body}</p>
      <Link href={href} className="mt-3.5 inline-block">
        <Button size="sm">
          {action}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  )
}

function Queue({ title, items }: { title: string; items: ActionItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-5">
      <SectionTitle>{title}</SectionTitle>
      <ul className="surface divide-y divide-white/[0.06] overflow-hidden">
        {items.slice(0, 5).map((item) => (
          <li key={item.pactId + item.label}>
            <Link href={`/p/${item.pactId}`} className="focus-ring flex items-center gap-3 px-4 py-3 active:bg-white/[0.04]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-semibold text-chalk">{item.title}</p>
                <p className="truncate text-[0.7rem] text-chalk-muted">{item.label}</p>
              </div>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-chalk-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

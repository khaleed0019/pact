import Link from 'next/link'
import { CalendarClock, ChevronRight, Lock, Users } from 'lucide-react'
import { Money } from '@/components/ui/Bits'
import { relativeDeadline } from '@/lib/format'
import { CATEGORY_LABEL, type BudgetSummary, type Campaign, type CampaignStatus } from '@/lib/campaigns/model'
import { cn } from '@/lib/cn'

const STATUS_LABEL: Record<CampaignStatus, string> = {
  OPEN: 'Open',
  PAUSED: 'Paused',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
}

export function CampaignStatusPill({ status }: { status: CampaignStatus }) {
  const live = status === 'OPEN'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium',
        live ? 'bg-jade/15 text-jade' : 'bg-white/[0.07] text-chalk-muted',
      )}
    >
      {live && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-jade" />}
      {STATUS_LABEL[status]}
    </span>
  )
}

/**
 * One campaign in a list: the offer, at a glance.
 *
 * Reward is the loudest thing on the card because it is what people scan for; deadline
 * and spots sit beside it because they decide whether it is still worth opening. The
 * spots bar is reward-coloured only while there is room — a full campaign reads as full
 * before you read the number. A solid surface, not glass: this is money and terms.
 */
export function CampaignCard({ campaign, budget }: { campaign: Campaign; budget: BudgetSummary }) {
  const deadline = campaign.deadline ? relativeDeadline(campaign.deadline) : null
  const full = budget.open === 0
  const filled = Math.min(100, Math.round((budget.taken / Math.max(1, budget.slots)) * 100))

  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="surface focus-ring group block px-4 py-4 transition-[transform,background-color] duration-150 hover:bg-ink-800 active:scale-[0.99]"
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-pill bg-white/[0.06] px-2 py-0.5 text-[0.65rem] text-chalk-muted">{CATEGORY_LABEL[campaign.category]}</span>
        {campaign.visibility === 'PRIVATE' && (
          <span className="inline-flex items-center gap-1 rounded-pill bg-azure/10 px-2 py-0.5 text-[0.65rem] text-azure-bright">
            <Lock aria-hidden className="h-3 w-3" />
            Invite only
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-body font-semibold leading-snug text-chalk">{campaign.title}</p>
          <p className="mt-0.5 truncate text-[0.7rem] text-chalk-faint">by {campaign.ownerName}</p>
        </div>
        <ChevronRight aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-chalk-faint transition-transform group-hover:translate-x-0.5" />
      </div>

      <p className="mt-2 line-clamp-2 text-small leading-relaxed text-chalk-muted">{campaign.brief}</p>

      <div className="mt-3.5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.62rem] uppercase tracking-wider text-chalk-faint">Reward per person</p>
          <Money minor={campaign.rewardMinor} currency={campaign.currency} size="lg" className="text-gold-bright" />
        </div>
        <div className="flex flex-col items-end gap-1.5 text-right">
          {campaign.status !== 'OPEN' && <CampaignStatusPill status={campaign.status} />}
          {deadline && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[0.7rem]',
                deadline.overdue ? 'text-rose' : deadline.soon ? 'text-amber' : 'text-chalk-muted',
              )}
            >
              <CalendarClock aria-hidden className="h-3.5 w-3.5" />
              {deadline.overdue ? 'Deadline passed' : deadline.label}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[0.7rem]">
          <span className="inline-flex items-center gap-1 text-chalk-muted">
            <Users aria-hidden className="h-3.5 w-3.5" />
            {full ? 'All spots taken' : `${budget.open} of ${budget.slots} spots left`}
          </span>
          <span className="tabular text-chalk-faint">{budget.taken} taken</span>
        </div>
        <div
          className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]"
          role="progressbar"
          aria-label="Spots taken"
          aria-valuemin={0}
          aria-valuemax={budget.slots}
          aria-valuenow={budget.taken}
        >
          <div className={cn('h-full rounded-full', full ? 'bg-chalk-faint' : 'bg-gold')} style={{ width: `${filled}%` }} />
        </div>
      </div>
    </Link>
  )
}

export function CampaignCardSkeleton() {
  return (
    <div className="surface px-4 py-4">
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton mt-2 h-3 w-1/3" />
      <div className="skeleton mt-3 h-3 w-full" />
      <div className="skeleton mt-1.5 h-3 w-5/6" />
      <div className="skeleton mt-4 h-6 w-24" />
      <div className="skeleton mt-3 h-1 w-full" />
    </div>
  )
}

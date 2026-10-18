import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Money } from '@/components/ui/Bits'
import { relativeDeadline } from '@/lib/format'
import type { BudgetSummary, Campaign, CampaignStatus } from '@/lib/campaigns/model'

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
      className={
        live
          ? 'rounded-full bg-jade/15 px-2 py-0.5 text-[0.65rem] font-medium text-jade'
          : 'rounded-full bg-white/[0.07] px-2 py-0.5 text-[0.65rem] font-medium text-chalk-muted'
      }
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

/** One campaign in a list. Shows the offer and how many spots are left — never anyone's agreement. */
export function CampaignCard({ campaign, budget }: { campaign: Campaign; budget: BudgetSummary }) {
  return (
    <Link href={`/campaigns/${campaign.id}`} className="surface flex items-center gap-3 px-4 py-3.5 active:bg-white/[0.05]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-chalk">{campaign.title}</p>
        <p className="mt-0.5 truncate text-[0.7rem] text-chalk-faint">
          {campaign.ownerName}
          {campaign.deadline ? ` · ${relativeDeadline(campaign.deadline).label}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Money minor={campaign.rewardMinor} currency={campaign.currency} size="sm" className="text-gold-bright" />
          <span className="text-[0.7rem] text-chalk-muted">
            {budget.open > 0 ? `${budget.open} of ${budget.slots} spots left` : 'All spots taken'}
          </span>
          {campaign.status !== 'OPEN' && <CampaignStatusPill status={campaign.status} />}
        </div>
      </div>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-chalk-faint" />
    </Link>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { CalendarClock, Inbox, Lock, Megaphone, Plus } from 'lucide-react'
import { api, toUserFacing } from '@/lib/client/api'
import { useSession } from '@/lib/client/session'
import { formatWithCurrency } from '@/lib/pact/money'
import { relativeDeadline } from '@/lib/format'
import { CampaignCard, CampaignCardSkeleton } from '@/components/campaigns/CampaignCard'
import { TabBar, TAB_BAR_SPACER } from '@/components/nav/TabBar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, StatusPill } from '@/components/ui/Bits'
import { TextInput } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import {
  CAMPAIGN_CATEGORIES,
  CATEGORY_LABEL,
  type BudgetSummary,
  type Campaign,
  type CampaignCategory,
  type CampaignInvitation,
} from '@/lib/campaigns/model'
import type { Currency, PactStatus } from '@/lib/pact/types'
import type { UserFacingError } from '@/lib/errors'

interface Card {
  campaign: Campaign
  budget: BudgetSummary
}
interface Claimed {
  campaign: Campaign
  pactId: string | null
  pactStatus: PactStatus | null
}
interface InvitationCard extends Card {
  invitation: CampaignInvitation
}
interface Data {
  open: Card[]
  mine: Card[]
  claimed: Claimed[]
  invitations: InvitationCard[]
}

type Tab = 'open' | 'invitations' | 'work' | 'mine'

/**
 * Campaigns.
 *
 * "Open" is the marketplace: public campaigns only — a private campaign never appears in
 * it. Contributors also get the invitations addressed to their wallet and the work they
 * have taken up; brands get the campaigns they posted. Every tab shows server data; the
 * filters narrow what the server sent and never invent anything.
 */
export default function CampaignsPage() {
  const { me } = useSession()
  const reduceMotion = useReducedMotion()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<UserFacingError | null>(null)
  const [tab, setTab] = useState<Tab>('open')

  const load = useCallback(async () => {
    try {
      setData(await api<Data>('/api/campaigns'))
      setError(null)
    } catch (cause) {
      setError(toUserFacing(cause))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, me?.address])

  // Land on invitations when there are some waiting — that is what a contributor came for.
  useEffect(() => {
    if (data && data.invitations.length > 0 && me?.role === 'CONTRIBUTOR') setTab((t) => (t === 'open' ? 'invitations' : t))
  }, [data, me?.role])

  const [query, setQuery] = useState('')
  const [currency, setCurrency] = useState<'ALL' | Currency>('ALL')
  const [category, setCategory] = useState<'ALL' | CampaignCategory>('ALL')
  const [hideFull, setHideFull] = useState(true)

  const offered = useMemo(
    () => data?.open.filter((c) => !data.mine.some((m) => m.campaign.id === c.campaign.id)) ?? [],
    [data],
  )
  const needle = query.trim().toLowerCase()
  const shown = offered.filter(
    (c) =>
      (currency === 'ALL' || c.campaign.currency === currency) &&
      (category === 'ALL' || c.campaign.category === category) &&
      (!hideFull || c.budget.open > 0) &&
      (needle === '' || `${c.campaign.title} ${c.campaign.ownerName} ${c.campaign.brief}`.toLowerCase().includes(needle)),
  )
  const filtering = needle !== '' || currency !== 'ALL' || category !== 'ALL' || !hideFull

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [{ id: 'open', label: 'Open' }]
  if (me?.role === 'CONTRIBUTOR') {
    tabs.push({ id: 'invitations', label: 'Invitations', count: data?.invitations.length ?? 0 })
    tabs.push({ id: 'work', label: 'My work', count: data?.claimed.length ?? 0 })
  }
  if (me?.role === 'BRAND') tabs.push({ id: 'mine', label: 'Posted', count: data?.mine.length ?? 0 })

  return (
    <main className={cn('mx-auto w-full max-w-[34rem] px-5', TAB_BAR_SPACER)}>
      <header className="safe-top flex items-center justify-between gap-3 py-4">
        <h1 className="text-display text-chalk">{me?.role === 'BRAND' ? 'Campaigns' : 'Find work'}</h1>
        {me?.role === 'BRAND' && (
          <Link href="/campaigns/new">
            <Button size="sm">
              <Plus aria-hidden className="h-4 w-4" />
              Post work
            </Button>
          </Link>
        )}
      </header>

      {tabs.length > 1 && (
        <div role="tablist" aria-label="Campaign lists" className="mb-5 flex gap-1 rounded-2xl bg-white/[0.05] p-1">
          {tabs.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className="focus-ring relative flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-small font-medium"
              >
                {active && (
                  <motion.span
                    layoutId={reduceMotion ? undefined : 'campaign-tab'}
                    aria-hidden
                    className="absolute inset-0 rounded-xl bg-ink-850 shadow-card"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span className={cn('relative', active ? 'text-chalk' : 'text-chalk-muted')}>{t.label}</span>
                {t.count !== undefined && t.count > 0 && (
                  <span
                    className={cn(
                      'tabular relative rounded-full px-1.5 text-[0.65rem] font-semibold',
                      t.id === 'invitations' ? 'bg-sun text-onsun' : 'bg-white/[0.1] text-chalk-muted',
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {error && <ErrorNotice error={error} className="mb-5" onRetry={() => void load()} />}

      {data === null && !error && (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <CampaignCardSkeleton key={i} />
          ))}
        </div>
      )}

      {data && tab === 'open' && (
        <section aria-label="Open campaigns">
          {offered.length > 0 && (
            <div className="mb-4 space-y-2.5">
              <TextInput
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search work or brands"
                aria-label="Search campaigns"
              />
              <div className="scroll-x -mx-5 flex gap-2 px-5" role="group" aria-label="Type of work">
                {(['ALL', ...CAMPAIGN_CATEGORIES] as const).map((c) => (
                  <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                    {c === 'ALL' ? 'All' : CATEGORY_LABEL[c]}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Currency and availability">
                {(['ALL', 'NIM', 'USDT'] as const).map((option) => (
                  <Chip key={option} active={currency === option} onClick={() => setCurrency(option)}>
                    {option === 'ALL' ? 'Any currency' : option}
                  </Chip>
                ))}
                <Chip active={hideFull} onClick={() => setHideFull((v) => !v)}>
                  Hide full
                </Chip>
              </div>
            </div>
          )}

          {shown.length === 0 && offered.length > 0 && filtering ? (
            <p className="surface px-4 py-6 text-center text-small text-chalk-muted">
              Nothing matches. Try a different search or turn a filter off.
            </p>
          ) : shown.length === 0 ? (
            <div className="surface">
              <EmptyState
                icon={<Megaphone className="h-8 w-8" />}
                title={data.mine.length > 0 ? 'Nothing from other brands yet' : 'Nothing open right now'}
                body={
                  data.mine.length > 0
                    ? 'Work other brands post shows up here. Yours is under Posted.'
                    : 'When a brand posts public work it shows up here. Invite-only campaigns are never listed — they arrive as invitations.'
                }
                action={
                  me?.role === 'BRAND' ? (
                    <Link href="/campaigns/new">
                      <Button>Post work</Button>
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              {shown.map((c) => (
                <CampaignCard key={c.campaign.id} {...c} />
              ))}
            </div>
          )}
        </section>
      )}

      {data && tab === 'invitations' && (
        <section aria-label="Invitations for you" className="space-y-2.5">
          {data.invitations.length === 0 ? (
            <div className="surface">
              <EmptyState
                icon={<Inbox className="h-8 w-8" />}
                title="No invitations"
                body="When a brand invites you by your @handle or wallet address, it shows up here. Set a handle in your profile so brands can find you."
              />
            </div>
          ) : (
            data.invitations.map((item) => <InvitationRow key={item.invitation.id} item={item} />)
          )}
        </section>
      )}

      {data && tab === 'work' && (
        <section aria-label="Work you’ve taken up" className="space-y-2.5">
          {data.claimed.length === 0 ? (
            <p className="surface px-4 py-6 text-center text-small text-chalk-muted">Nothing taken up yet.</p>
          ) : (
            data.claimed.map((c) => (
              <Link
                key={c.campaign.id}
                href={c.pactId ? `/p/${c.pactId}` : `/campaigns/${c.campaign.id}`}
                className="surface focus-ring flex items-center justify-between gap-3 px-4 py-3.5 active:bg-white/[0.05]"
              >
                <div className="min-w-0">
                  <p className="truncate text-body font-semibold text-chalk">{c.campaign.title}</p>
                  <p className="mt-0.5 truncate text-[0.7rem] text-chalk-faint">{c.campaign.ownerName}</p>
                </div>
                {c.pactStatus && <StatusPill status={c.pactStatus} />}
              </Link>
            ))
          )}
        </section>
      )}

      {data && tab === 'mine' && (
        <section aria-label="Campaigns you posted" className="space-y-2.5">
          {data.mine.length === 0 ? (
            <div className="surface">
              <EmptyState
                icon={<Megaphone className="h-8 w-8" />}
                title="You haven’t posted anything yet"
                body="Post public work for anyone to take up, or invite specific people by @handle or wallet."
                action={
                  <Link href="/campaigns/new">
                    <Button>Post work</Button>
                  </Link>
                }
              />
            </div>
          ) : (
            data.mine.map((c) => <CampaignCard key={c.campaign.id} {...c} />)
          )}
        </section>
      )}

      <TabBar />
    </main>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'focus-ring min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-small transition-colors',
        active ? 'border-gold/45 bg-gold/10 text-chalk' : 'border-white/[0.08] text-chalk-muted active:bg-white/[0.06]',
      )}
    >
      {children}
    </button>
  )
}

/** An invitation: who, what, how much, by when. Opening it shows the full terms before any answer. */
function InvitationRow({ item }: { item: InvitationCard }) {
  const { campaign } = item
  const deadline = campaign.deadline ? relativeDeadline(campaign.deadline) : null
  return (
    <article className="surface overflow-hidden">
      <div className="px-4 pb-3 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-pill bg-sun px-2 py-0.5 text-[0.65rem] font-semibold text-onsun">Invitation</span>
          {campaign.visibility === 'PRIVATE' && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-azure/10 px-2 py-0.5 text-[0.65rem] text-azure-bright">
              <Lock aria-hidden className="h-3 w-3" />
              Only for you
            </span>
          )}
          <span className="text-[0.7rem] text-chalk-faint">from {campaign.ownerName}</span>
        </div>
        <p className="mt-2 text-body font-semibold leading-snug text-chalk">{campaign.title}</p>
        <p className="mt-1 line-clamp-2 text-small text-chalk-muted">{campaign.brief}</p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="tabular text-title text-gold-bright">{formatWithCurrency(campaign.rewardMinor, campaign.currency)}</p>
          {deadline && (
            <span className="inline-flex items-center gap-1 text-[0.7rem] text-chalk-muted">
              <CalendarClock aria-hidden className="h-3.5 w-3.5" />
              {deadline.label}
            </span>
          )}
        </div>
      </div>
      <Link
        href={`/campaigns/${campaign.id}`}
        className="focus-ring flex min-h-tap items-center justify-center border-t border-white/[0.06] text-small font-semibold text-gold-bright active:bg-white/[0.04]"
      >
        Review invitation
      </Link>
    </article>
  )
}

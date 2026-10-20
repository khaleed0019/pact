'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Megaphone, Plus } from 'lucide-react'
import { api, toUserFacing } from '@/lib/client/api'
import { useSession } from '@/lib/client/session'
import { CampaignCard, CampaignCardSkeleton } from '@/components/campaigns/CampaignCard'
import { TabBar, TAB_BAR_SPACER } from '@/components/nav/TabBar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, SectionTitle, Skeleton, StatusPill } from '@/components/ui/Bits'
import { cn } from '@/lib/cn'
import type { BudgetSummary, Campaign } from '@/lib/campaigns/model'
import type { Currency, PactStatus } from '@/lib/pact/types'
import { TextInput } from '@/components/ui/Field'
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

/**
 * Earn: work brands are offering, and what you have taken up.
 *
 * Browsing is open to anyone. Taking one up creates your own agreement with the brand,
 * so it needs a signed-in wallet, and nothing is owed to you until the brand has signed
 * it and approved your work.
 */
export default function CampaignsPage() {
  const { me } = useSession()
  const [data, setData] = useState<{ open: Card[]; mine: Card[]; claimed: Claimed[] } | null>(null)
  const [error, setError] = useState<UserFacingError | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api('/api/campaigns'))
      setError(null)
    } catch (cause) {
      setError(toUserFacing(cause))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, me?.address])

  const [query, setQuery] = useState('')
  const [currency, setCurrency] = useState<'ALL' | Currency>('ALL')
  const [hideFull, setHideFull] = useState(true)

  const offered = data?.open.filter((c) => !data.mine.some((m) => m.campaign.id === c.campaign.id)) ?? []
  const needle = query.trim().toLowerCase()
  const others = offered.filter(
    (c) =>
      (currency === 'ALL' || c.campaign.currency === currency) &&
      (!hideFull || c.budget.open > 0) &&
      (needle === '' || `${c.campaign.title} ${c.campaign.ownerName} ${c.campaign.brief}`.toLowerCase().includes(needle)),
  )
  const filtering = needle !== '' || currency !== 'ALL' || !hideFull

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

      <p className="mb-5 text-small leading-relaxed text-chalk-muted">
        Work brands are offering for a fixed reward. Take one up and you get your own agreement with the brand — they
        pay you directly in Nimiq Pay once they approve what you send.
      </p>

      {error && <ErrorNotice error={error} className="mb-5" onRetry={() => void load()} />}

      {data === null && !error && (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <CampaignCardSkeleton key={i} />
          ))}
        </div>
      )}

      {data && data.mine.length > 0 && (
        <section className="mb-7">
          <SectionTitle>Work you’ve posted</SectionTitle>
          <div className="space-y-2.5">
            {data.mine.map((c) => (
              <CampaignCard key={c.campaign.id} {...c} />
            ))}
          </div>
        </section>
      )}

      {data && data.claimed.length > 0 && (
        <section className="mb-7">
          <SectionTitle>You’ve taken up</SectionTitle>
          <div className="space-y-2.5">
            {data.claimed.map((c) => (
              <Link
                key={c.campaign.id}
                href={c.pactId ? `/p/${c.pactId}` : `/campaigns/${c.campaign.id}`}
                className="surface flex items-center justify-between gap-3 px-4 py-3.5 active:bg-white/[0.05]"
              >
                <div className="min-w-0">
                  <p className="truncate text-body font-semibold text-chalk">{c.campaign.title}</p>
                  <p className="mt-0.5 truncate text-[0.7rem] text-chalk-faint">{c.campaign.ownerName}</p>
                </div>
                {c.pactStatus && <StatusPill status={c.pactStatus} />}
              </Link>
            ))}
          </div>
        </section>
      )}

      {data && (
        <section>
          <SectionTitle>Open now</SectionTitle>
          {offered.length > 0 && (
            <div className="mb-3 space-y-2.5">
              <TextInput
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search work or brands"
                aria-label="Search campaigns"
              />
              <div className="flex flex-wrap items-center gap-2">
                {(['ALL', 'NIM', 'USDT'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={currency === option}
                    onClick={() => setCurrency(option)}
                    className={cn(
                      'min-h-9 rounded-full border px-3.5 text-small transition-colors',
                      currency === option
                        ? 'border-gold/45 bg-gold/12 text-chalk'
                        : 'border-white/[0.08] text-chalk-muted active:bg-white/[0.06]',
                    )}
                  >
                    {option === 'ALL' ? 'Any currency' : option}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={hideFull}
                  onClick={() => setHideFull((v) => !v)}
                  className={cn(
                    'min-h-9 rounded-full border px-3.5 text-small transition-colors',
                    hideFull ? 'border-gold/45 bg-gold/12 text-chalk' : 'border-white/[0.08] text-chalk-muted',
                  )}
                >
                  Hide full
                </button>
              </div>
            </div>
          )}
          {others.length === 0 && offered.length > 0 && filtering ? (
            <p className="surface px-4 py-6 text-center text-small text-chalk-muted">
              Nothing matches. Try a different search or turn a filter off.
            </p>
          ) : others.length === 0 ? (
            <div className="surface">
              <EmptyState
                icon={<Megaphone className="h-8 w-8" />}
                title={data.mine.length > 0 ? 'Nothing from other brands yet' : 'Nothing open right now'}
                body={
                  data.mine.length > 0
                    ? 'Work other brands post shows up here. Yours is listed above, and people can take it up from there.'
                    : 'When a brand posts work it shows up here. You can post your own — set a reward, say what you need, and people can take it up.'
                }
                action={
                  me?.role === 'BRAND' && data.mine.length === 0 ? (
                    <Link href="/campaigns/new">
                      <Button>Post work</Button>
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              {others.map((c) => (
                <CampaignCard key={c.campaign.id} {...c} />
              ))}
            </div>
          )}
        </section>
      )}

      <TabBar />
    </main>
  )
}

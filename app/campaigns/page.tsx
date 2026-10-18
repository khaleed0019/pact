'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Megaphone, Plus } from 'lucide-react'
import { api, toUserFacing } from '@/lib/client/api'
import { useSession } from '@/lib/client/session'
import { CampaignCard } from '@/components/campaigns/CampaignCard'
import { TabBar, TAB_BAR_SPACER } from '@/components/nav/TabBar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, SectionTitle, Skeleton, StatusPill } from '@/components/ui/Bits'
import { cn } from '@/lib/cn'
import type { BudgetSummary, Campaign } from '@/lib/campaigns/model'
import type { PactStatus } from '@/lib/pact/types'
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

  const others = data?.open.filter((c) => !data.mine.some((m) => m.campaign.id === c.campaign.id)) ?? []

  return (
    <main className={cn('mx-auto w-full max-w-[34rem] px-5', TAB_BAR_SPACER)}>
      <header className="safe-top flex items-center justify-between gap-3 py-4">
        <h1 className="text-display text-chalk">Earn</h1>
        {me?.signedIn && (
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
            <Skeleton key={i} className="h-24" />
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
          {others.length === 0 ? (
            <div className="surface">
              <EmptyState
                icon={<Megaphone className="h-8 w-8" />}
                title="Nothing open right now"
                body="When a brand posts work it shows up here. You can post your own — set a reward, say what you need, and people can take it up."
                action={
                  me?.signedIn ? (
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

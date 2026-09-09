'use client'

import { useMemo, useState } from 'react'
import { Globe, FileStack } from 'lucide-react'
import Link from 'next/link'
import { useSession } from '@/lib/client/session'
import { sortForDashboard } from '@/lib/pact/insights'
import { isTerminal } from '@/lib/pact/state'
import { PactCard } from '@/components/pact/PactCard'
import { TabBar, TAB_BAR_SPACER } from '@/components/nav/TabBar'
import { Button } from '@/components/ui/Button'
import { EmptyState, Skeleton } from '@/components/ui/Bits'
import { cn } from '@/lib/cn'

/**
 * Every agreement you're part of, in one list.
 *
 * The Command Center is deliberately narrow — it shows what needs you and what's due
 * soon, and stays out of the way otherwise. This is the other half: the complete
 * ledger, filterable, for the moment you want to find one specific PACT rather than be
 * told what's urgent.
 */

type Filter = 'active' | 'completed' | 'all'

export default function PactsPage() {
  const { me, loading } = useSession()
  const [filter, setFilter] = useState<Filter>('active')

  const pacts = useMemo(() => me?.pacts ?? [], [me?.pacts])
  const address = me?.address ?? ''
  const sorted = useMemo(() => sortForDashboard(pacts, address), [pacts, address])

  const filtered = useMemo(() => {
    if (filter === 'all') return sorted
    if (filter === 'completed') return sorted.filter((p) => isTerminal(p.status))
    return sorted.filter((p) => !isTerminal(p.status))
  }, [sorted, filter])

  const counts = useMemo(
    () => ({
      active: pacts.filter((p) => !isTerminal(p.status)).length,
      completed: pacts.filter((p) => isTerminal(p.status)).length,
      all: pacts.length,
    }),
    [pacts],
  )

  if (loading) {
    return (
      <main className={cn('mx-auto w-full max-w-[34rem] px-5 py-6', TAB_BAR_SPACER)}>
        <Skeleton className="h-8 w-32" />
        <div className="mt-5 space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </main>
    )
  }

  return (
    <>
      <main className={cn('mx-auto w-full max-w-[34rem] px-5', TAB_BAR_SPACER)}>
        <header className="safe-top flex items-center justify-between gap-3 py-4">
          <h1 className="text-display text-chalk">Your PACTs</h1>
          <Link
            href="/discover"
            className="flex min-h-tap shrink-0 items-center gap-1.5 rounded-full border border-white/[0.09] px-3.5 text-small text-chalk-muted active:bg-white/[0.07]"
          >
            <Globe aria-hidden className="h-3.5 w-3.5" />
            Public
          </Link>
        </header>

        <div className="scroll-x -mx-5 mb-5 flex gap-2 px-5">
          {(
            [
              ['active', `Active${counts.active ? ` (${counts.active})` : ''}`],
              ['completed', `Completed${counts.completed ? ` (${counts.completed})` : ''}`],
              ['all', `All${counts.all ? ` (${counts.all})` : ''}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                'shrink-0 rounded-pill border px-3.5 py-2 text-small font-medium transition-colors duration-150',
                filter === value
                  ? 'border-gold/40 bg-gold/12 text-chalk'
                  : 'border-white/[0.08] bg-white/[0.02] text-chalk-muted active:bg-white/[0.06]',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="surface">
            <EmptyState
              icon={<FileStack className="h-8 w-8" />}
              title={pacts.length === 0 ? 'No agreements yet' : `Nothing ${filter === 'completed' ? 'completed' : filter}`}
              body={
                pacts.length === 0
                  ? 'Describe a deal in your own words and PACT will turn it into terms both sides can sign.'
                  : 'Nothing to show in this filter yet.'
              }
              action={
                pacts.length === 0 ? (
                  <Link href="/new">
                    <Button>Create a PACT</Button>
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((pact) => (
              <PactCard key={pact.id} pact={pact} viewerAddress={address} />
            ))}
          </div>
        )}
      </main>
      <TabBar />
    </>
  )
}

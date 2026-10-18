'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { api, toUserFacing } from '@/lib/client/api'
import { useSession } from '@/lib/client/session'
import { formatWithCurrency } from '@/lib/pact/money'
import { relativeDeadline } from '@/lib/format'
import { CLAIM_BLOCKER_MESSAGE } from '@/lib/campaigns/model'
import type { BudgetSummary, Campaign, ClaimBlocker } from '@/lib/campaigns/model'
import type { ClaimOverview } from '@/lib/campaigns/service'
import { CampaignStatusPill } from '@/components/campaigns/CampaignCard'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, Money, SectionTitle, Skeleton, StatusPill } from '@/components/ui/Bits'
import type { UserFacingError } from '@/lib/errors'

type Detail =
  | { viewer: 'OWNER'; campaign: Campaign; budget: BudgetSummary; claims: ClaimOverview[] }
  | { viewer: 'JOBBER' | 'GUEST'; campaign: Campaign; budget: BudgetSummary; blocker: ClaimBlocker | null; myPactId: string | null }

/**
 * One campaign. Three audiences, one URL:
 *
 *  - anyone sees the offer and how many spots are left
 *  - a signed-in jobber can take it up, or jump to the agreement they already made
 *  - the owner sees who took it up, where each agreement stands and what is *really* paid
 */
export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { me } = useSession()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<UserFacingError | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    try {
      setDetail(await api<Detail>(`/api/campaigns/${id}`))
      setError(null)
    } catch (cause) {
      setError(toUserFacing(cause))
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load, me?.address])

  const claim = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ pactId: string }>(`/api/campaigns/${id}/claim`, {
        method: 'POST',
        body: { name: (name || me?.displayName || '').trim() },
      })
      router.push(`/p/${result.pactId}`)
    } catch (cause) {
      setError(toUserFacing(cause))
      setBusy(false)
      void load()
    }
  }

  const setStatus = async (status: Campaign['status']) => {
    setBusy(true)
    try {
      await api(`/api/campaigns/${id}/status`, { method: 'PATCH', body: { status } })
      await load()
    } catch (cause) {
      setError(toUserFacing(cause))
    }
    setBusy(false)
  }

  const campaign = detail?.campaign

  return (
    <main className="safe-top mx-auto w-full max-w-[34rem] px-5 pb-16">
      <header className="flex items-center gap-2 py-3">
        <Link
          href="/campaigns"
          aria-label="Back"
          className="-ml-2 flex h-tap w-tap items-center justify-center rounded-full text-chalk-muted active:bg-white/10"
        >
          <ArrowLeft aria-hidden className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-heading text-chalk">Campaign</h1>
        {campaign && <CampaignStatusPill status={campaign.status} />}
      </header>

      {error && <ErrorNotice error={error} className="mb-4" />}
      {!detail && !error && <Skeleton className="h-48" />}

      {detail && campaign && (
        <div className="space-y-6">
          <section className="surface px-4 py-4">
            <h2 className="text-balance text-title text-chalk">{campaign.title}</h2>
            <p className="mt-1 text-small text-chalk-muted">From {campaign.ownerName}</p>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <Money minor={campaign.rewardMinor} currency={campaign.currency} size="xl" className="text-gold-bright" />
              <span className="text-small text-chalk-muted">per person</span>
            </div>
            <p className="mt-3 text-small text-chalk-muted">
              {detail.budget.open > 0
                ? `${detail.budget.open} of ${detail.budget.slots} spots left`
                : 'All spots are taken'}
              {campaign.deadline ? ` · ${relativeDeadline(campaign.deadline).label}` : ''}
            </p>
          </section>

          <section>
            <SectionTitle>The brief</SectionTitle>
            <p className="whitespace-pre-line text-body leading-relaxed text-chalk">{campaign.brief}</p>
            {campaign.requirements.length > 0 && (
              <ul className="mt-4 list-disc space-y-1.5 pl-5 text-small text-chalk-muted">
                {campaign.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </section>

          {detail.viewer !== 'OWNER' && (
            <section className="space-y-3">
              {detail.myPactId ? (
                <Link href={`/p/${detail.myPactId}`}>
                  <Button size="lg" fullWidth>
                    Open your agreement
                  </Button>
                </Link>
              ) : detail.viewer === 'GUEST' ? (
                <Link href="/">
                  <Button size="lg" fullWidth>
                    Sign in to take this up
                  </Button>
                </Link>
              ) : detail.blocker ? (
                <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-small text-chalk-muted">
                  {CLAIM_BLOCKER_MESSAGE[detail.blocker]}
                </p>
              ) : (
                <>
                  {!me?.displayName && (
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      aria-label="Your name"
                      maxLength={80}
                      className="min-h-tap w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-3 text-body text-chalk placeholder:text-chalk-faint focus:border-gold/50 focus:outline-none"
                    />
                  )}
                  <Button size="lg" fullWidth busy={busy} disabled={!name && !me?.displayName} onClick={() => void claim()}>
                    Take this up
                  </Button>
                  <p className="px-1 text-[0.7rem] leading-relaxed text-chalk-faint">
                    This creates your own agreement with {campaign.ownerName}. Nothing is owed until you’ve both signed
                    it, and they pay you directly once they approve your work.
                  </p>
                </>
              )}
            </section>
          )}

          {detail.viewer === 'OWNER' && (
            <>
              <section>
                <SectionTitle>Budget</SectionTitle>
                <dl className="surface divide-y divide-white/[0.06]">
                  <Line label="Most this can commit you to" value={formatWithCurrency(detail.budget.ceilingMinor, campaign.currency)} />
                  <Line label="Agreed so far" value={formatWithCurrency(detail.budget.committedMinor, campaign.currency)} />
                  <Line label="Confirmed paid" value={formatWithCurrency(detail.budget.paidMinor, campaign.currency)} strong />
                </dl>
                <p className="mt-2 px-1 text-[0.7rem] leading-relaxed text-chalk-faint">
                  None of this is held anywhere. You pay each person from your own wallet, and a payment counts as paid
                  only once it’s confirmed on the network.
                </p>
              </section>

              <section>
                <SectionTitle>People</SectionTitle>
                {detail.claims.length === 0 ? (
                  <p className="text-small text-chalk-muted">No one has taken this up yet.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {detail.claims.map((c) => (
                      <li key={c.claim.id}>
                        <Link
                          href={c.pactId ? `/p/${c.pactId}` : '#'}
                          className="surface flex items-center gap-3 px-4 py-3.5 active:bg-white/[0.05]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-body font-semibold text-chalk">{c.jobberName}</p>
                            <p className="mt-0.5 text-[0.7rem] text-chalk-muted">{nextStep(c)}</p>
                          </div>
                          {c.pactStatus && <StatusPill status={c.pactStatus} />}
                          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-chalk-faint" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {(campaign.status === 'OPEN' || campaign.status === 'PAUSED') && (
                <section className="space-y-2">
                  {campaign.status === 'OPEN' ? (
                    <Button variant="secondary" fullWidth busy={busy} onClick={() => void setStatus('PAUSED')}>
                      Pause — stop taking new people
                    </Button>
                  ) : (
                    <Button variant="secondary" fullWidth busy={busy} onClick={() => void setStatus('OPEN')}>
                      Reopen
                    </Button>
                  )}
                  <Button variant="ghost" fullWidth busy={busy} onClick={() => void setStatus('CLOSED')}>
                    Close this campaign
                  </Button>
                  <p className="px-1 text-[0.7rem] leading-relaxed text-chalk-faint">
                    Pausing or closing stops new people. Agreements already made stay as they are.
                  </p>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </main>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="text-small text-chalk-faint">{label}</dt>
      <dd className={strong ? 'tabular text-small font-semibold text-chalk' : 'tabular text-small text-chalk-muted'}>{value}</dd>
    </div>
  )
}

/** What this agreement is waiting for, in the brand's terms. */
function nextStep(c: ClaimOverview): string {
  if (c.paidMinor !== '0') return 'Paid'
  if (c.paymentSubmitted) return 'Payment sent — waiting to be confirmed'
  if (c.awaitingBrandSignature) return 'Waiting for your signature'
  if (c.awaitingReview) return 'Work submitted — waiting for your review'
  if (c.pactStatus === 'DELIVERED') return 'Approved — ready to pay'
  if (!c.sealed) return 'Waiting for both signatures'
  return 'In progress'
}

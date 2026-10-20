'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { api, toUserFacing } from '@/lib/client/api'
import { useSession } from '@/lib/client/session'
import { formatWithCurrency } from '@/lib/pact/money'
import { formatLongDate, relativeDeadline } from '@/lib/format'
import { CLAIM_BLOCKER_MESSAGE } from '@/lib/campaigns/model'
import { termsFromCampaign } from '@/lib/campaigns/service'
import { EVM_CHAINS } from '@/lib/pact/types'
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
  const [previewing, setPreviewing] = useState(false)

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
              ) : me?.role !== 'CONTRIBUTOR' ? (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
                  <p className="text-small text-chalk-muted">
                    Taking up work is for contributors. You’re using PACT as a brand.
                  </p>
                  <Link href="/trust" className="mt-1.5 inline-block text-small font-medium text-gold-bright underline underline-offset-4">
                    Switch in your profile
                  </Link>
                </div>
              ) : detail.blocker ? (
                <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-small text-chalk-muted">
                  {CLAIM_BLOCKER_MESSAGE[detail.blocker]}
                </p>
              ) : !previewing ? (
                <Button size="lg" fullWidth onClick={() => setPreviewing(true)}>
                  Review the agreement
                </Button>
              ) : (
                <>
                  <AgreementPreview campaign={campaign} />
                  {!me?.displayName && (
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name, as the brand will see it"
                      aria-label="Your name"
                      maxLength={80}
                      className="focus-ring min-h-tap w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-3 text-body text-chalk placeholder:text-chalk-faint focus:border-gold/50"
                    />
                  )}
                  <Button size="lg" fullWidth busy={busy} disabled={!name && !me?.displayName} onClick={() => void claim()}>
                    Take this up — you’ll sign next
                  </Button>
                  <Button variant="ghost" fullWidth disabled={busy} onClick={() => setPreviewing(false)}>
                    Not yet
                  </Button>
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
                      <PersonRow key={c.claim.id} claim={c} onChanged={() => void load()} />
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

/**
 * One person's agreement, as the brand sees it. When they have submitted work it can be
 * reviewed right here, through the same endpoint the pact page uses — approving or asking
 * for changes is the pact's own action, not a second implementation of it.
 */
function PersonRow({ claim: c, onChanged }: { claim: ClaimOverview; onChanged: () => void }) {
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UserFacingError | null>(null)

  const review = async (status: 'APPROVED' | 'CHANGES_REQUESTED') => {
    if (!c.pendingDelivery) return
    setBusy(true)
    setError(null)
    try {
      await api(`/api/deliverables/${c.pendingDelivery.id}`, {
        method: 'PATCH',
        body: { status, reviewNote: status === 'CHANGES_REQUESTED' ? note.trim() || null : null },
      })
      setAsking(false)
      setNote('')
      onChanged()
    } catch (cause) {
      setError(toUserFacing(cause))
    }
    setBusy(false)
  }

  return (
    <li className="surface overflow-hidden">
      <Link href={c.pactId ? `/p/${c.pactId}` : '#'} className="flex items-center gap-3 px-4 py-3.5 active:bg-white/[0.05]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-chalk">{c.jobberName}</p>
          <p className="mt-0.5 text-[0.7rem] text-chalk-muted">{nextStep(c)}</p>
        </div>
        {c.pactStatus && <StatusPill status={c.pactStatus} />}
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-chalk-faint" />
      </Link>

      {c.pendingDelivery && (
        <div className="space-y-3 border-t border-white/[0.06] px-4 py-3">
          <p className="whitespace-pre-line text-small text-chalk">{c.pendingDelivery.note}</p>
          {c.pendingDelivery.link && (
            <a
              href={c.pendingDelivery.link}
              target="_blank"
              rel="noreferrer noopener"
              className="block break-all text-small font-medium text-azure-bright underline underline-offset-4"
            >
              {c.pendingDelivery.link}
            </a>
          )}
          {asking && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="What needs to change?"
              aria-label="What needs to change"
              className="w-full resize-none rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-small text-chalk placeholder:text-chalk-faint focus:border-gold/50 focus:outline-none"
            />
          )}
          {error && <ErrorNotice error={error} />}
          <div className="flex gap-2">
            {asking ? (
              <>
                <Button size="sm" busy={busy} onClick={() => void review('CHANGES_REQUESTED')}>
                  Send back
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" busy={busy} onClick={() => void review('APPROVED')}>
                  Approve
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
                  Request changes
                </Button>
              </>
            )}
          </div>
          <p className="text-[0.65rem] leading-relaxed text-chalk-faint">
            Approving doesn’t pay. You pay from their agreement once you’re happy.
          </p>
        </div>
      )}
    </li>
  )
}

/**
 * Exactly the terms taking this up will create — built by the same function the server
 * uses (`termsFromCampaign`), so what you read here is what you will be asked to sign.
 */
function AgreementPreview({ campaign }: { campaign: Campaign }) {
  const terms = termsFromCampaign(campaign)
  return (
    <div className="surface overflow-hidden">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <p className="text-micro uppercase tracking-wider text-chalk-faint">The agreement you’ll get</p>
        <p className="mt-1 text-heading text-chalk">{campaign.title}</p>
      </div>
      <dl className="divide-y divide-white/[0.06]">
        <Line label="Between" value={`You and ${campaign.ownerName}`} />
        <Line label="You’re paid" value={formatWithCurrency(campaign.rewardMinor, campaign.currency)} strong />
        <Line label="Network" value={campaign.chain ? `USDT on ${EVM_CHAINS[campaign.chain].name}` : 'Nimiq'} />
        <Line label="Deadline" value={campaign.deadline ? formatLongDate(campaign.deadline) : 'None set'} />
      </dl>
      <div className="space-y-3 border-t border-white/[0.06] px-4 py-3">
        <div>
          <p className="text-[0.7rem] font-medium text-chalk-faint">What you deliver</p>
          <p className="mt-1 whitespace-pre-line text-small leading-relaxed text-chalk">{terms.deliverable}</p>
        </div>
        <div>
          <p className="text-[0.7rem] font-medium text-chalk-faint">When you’re paid</p>
          <p className="mt-1 text-small text-chalk">{terms.paymentCondition}</p>
        </div>
        <ul className="space-y-1 text-[0.7rem] leading-relaxed text-chalk-muted">
          <li>· Nothing is binding until you and the brand have both signed it with your wallets.</li>
          <li>· The brand can approve your work or ask for changes, with a reason.</li>
          <li>· Payment goes wallet to wallet. PACT doesn’t hold it, and marks it paid only once the network confirms.</li>
          <li>· If the brand declines the agreement, your spot goes back and nothing is owed.</li>
        </ul>
      </div>
    </div>
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

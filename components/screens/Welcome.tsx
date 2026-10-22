'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  EyeOff,
  FileSignature,
  Handshake,
  Package,
  ScanSearch,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { useSession } from '@/lib/client/session'
import { api } from '@/lib/client/api'
import { formatWithCurrency } from '@/lib/pact/money'
import { relativeDeadline } from '@/lib/format'
import { CATEGORY_LABEL, type BudgetSummary, type Campaign } from '@/lib/campaigns/model'
import { PactSeal } from '@/components/seal/PactSeal'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, SectionTitle } from '@/components/ui/Bits'
import { ThemeSwitch } from '@/components/ui/ThemeSwitch'
import { cn } from '@/lib/cn'

/**
 * The landing screen.
 *
 * Mobile-first, because this is a Mini App: one column, the Seal as the focal point, and
 * both ways in reachable without scrolling. Below the fold, the page answers the four
 * questions a brand or contributor actually has — who is this for, how does it work,
 * why should I believe a payment, and what does PACT hold (nothing).
 *
 * Every claim here maps to something the app does. The campaign card shows a real public
 * campaign when one exists and is labelled "Example" when it does not. No user counts,
 * testimonials or partner logos — PACT has none to show, so it shows none.
 */

const riseStyle = (index: number): CSSProperties => ({ '--rise-index': index }) as CSSProperties

/** Remember which door someone came in through, so the role screen can preselect it. */
export const INTENT_KEY = 'pact-intent'

function OrbitRing({
  radius,
  count,
  duration,
  reverse,
  moving,
}: {
  radius: number
  count: number
  duration: number
  reverse?: boolean
  moving: boolean
}) {
  const size = radius * 2
  return (
    <div
      className={cn('absolute left-1/2 top-1/2', moving && 'orbit')}
      style={{
        width: size,
        height: size,
        marginLeft: -radius,
        marginTop: -radius,
        ...(moving ? { animationDuration: `${duration}s`, animationDirection: reverse ? 'reverse' : 'normal' } : {}),
      }}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, index) => {
        const angle = (index / count) * Math.PI * 2
        return (
          <span
            key={index}
            className="absolute rounded-full bg-gold/60"
            style={{
              width: index % 3 === 0 ? 3 : 2,
              height: index % 3 === 0 ? 3 : 2,
              left: radius + Math.cos(angle) * radius,
              top: radius + Math.sin(angle) * radius,
              opacity: index % 2 === 0 ? 0.7 : 0.35,
            }}
          />
        )
      })}
    </div>
  )
}

const FLOW = [
  { icon: FileSignature, label: 'Brief', body: 'The brand says what it needs' },
  { icon: Handshake, label: 'Agree', body: 'Both sign the exact terms' },
  { icon: Package, label: 'Deliver', body: 'Work is submitted and reviewed' },
  { icon: Wallet, label: 'Pay', body: 'Paid in Nimiq Pay, then verified' },
]

/** Shown only when no real public campaign exists yet, and labelled as an example. */
const EXAMPLE: { campaign: Campaign; budget: BudgetSummary } = {
  campaign: {
    id: 'example',
    ownerAddress: '',
    ownerName: 'A brand',
    title: 'Cut three short clips from our launch stream',
    brief: 'Pick the three strongest moments and cut them into vertical clips with captions.',
    requirements: [],
    visibility: 'PUBLIC',
    category: 'VIDEO',
    submissionInstructions: '',
    platform: '',
    revisionLimit: 2,
    currency: 'NIM',
    chain: null,
    rewardMinor: '2500000',
    slots: 3,
    deadline: null,
    status: 'OPEN',
    createdAt: '',
    updatedAt: '',
  },
  budget: { rewardMinor: '2500000', slots: 3, taken: 0, open: 3, committedMinor: '0', paidMinor: '0', ceilingMinor: '7500000' },
}

export function Welcome() {
  const { signInWithWallet, signInAsDemo, connecting, environment, error } = useSession()
  const reduceMotion = useReducedMotion()
  const inNimiqPay = environment === 'nimiq-pay'
  const [featured, setFeatured] = useState<{ campaign: Campaign; budget: BudgetSummary } | null>(null)
  const [isExample, setIsExample] = useState(true)

  useEffect(() => {
    api<{ open: Array<{ campaign: Campaign; budget: BudgetSummary }> }>('/api/campaigns')
      .then((data) => {
        const first = data.open.find((c) => c.budget.open > 0)
        if (first) {
          setFeatured(first)
          setIsExample(false)
        } else setFeatured(EXAMPLE)
      })
      .catch(() => setFeatured(EXAMPLE))
  }, [])

  const enter = (intent: 'BRAND' | 'CONTRIBUTOR') => {
    try {
      sessionStorage.setItem(INTENT_KEY, intent)
    } catch {
      // Without storage the role screen simply starts unselected.
    }
    void signInWithWallet()
  }

  const card = featured ?? EXAMPLE
  const deadline = card.campaign.deadline ? relativeDeadline(card.campaign.deadline) : null

  return (
    <div className="relative min-h-[var(--app-height)] overflow-hidden">
      {/* --- ambient canvas: two still glows, nothing moving behind the text --------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[40rem] overflow-hidden" aria-hidden>
        <div
          className={cn('aura', !reduceMotion && 'aura-drift')}
          style={{
            width: '78vw',
            height: '78vw',
            maxWidth: 460,
            maxHeight: 460,
            top: '-14%',
            left: '-22%',
            background: 'radial-gradient(circle, rgba(233,178,19,0.26), transparent 68%)',
            animationDuration: '24s',
          }}
        />
        <div
          className={cn('aura', !reduceMotion && 'aura-drift')}
          style={{
            width: '72vw',
            height: '72vw',
            maxWidth: 420,
            maxHeight: 420,
            top: '6%',
            right: '-26%',
            background: 'radial-gradient(circle, rgba(5,130,202,0.22), transparent 68%)',
            animationDuration: '31s',
            animationDelay: '-8s',
          }}
        />
      </div>

      <main className="safe-top relative mx-auto w-full max-w-[34rem] px-5 pb-10">
        {/* --- hero ---------------------------------------------------------------- */}
        <section className="flex flex-col items-center pt-6 text-center">
          <div className="rise relative flex h-[12.5rem] w-[12.5rem] items-center justify-center" style={riseStyle(0)}>
            <OrbitRing radius={92} count={16} duration={64} moving={!reduceMotion} />
            <OrbitRing radius={74} count={8} duration={44} reverse moving={!reduceMotion} />
            <div
              aria-hidden
              className="absolute h-[10rem] w-[10rem] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(233,178,19,0.12), transparent 62%)' }}
            />
            <PactSeal status="COMPLETED" digest="7c1af49e2b8d0356e4a9f10c8b27d5e3" size="lg" animate label="An example PACT seal" />
          </div>

          <p className="rise glass mt-6 inline-flex rounded-pill px-3 py-1 text-[0.7rem] font-medium text-chalk-muted" style={riseStyle(1)}>
            Don’t just send money. Send certainty.
          </p>

          <h1 className="rise mt-4 text-balance text-display-lg text-chalk" style={riseStyle(2)}>
            A clear brief. Signed terms.{' '}
            <span className={cn(!reduceMotion && 'text-shine')} style={reduceMotion ? { color: 'rgb(var(--gold-bright))' } : undefined}>
              Trackable payment.
            </span>
          </h1>

          <p className="rise mt-3.5 max-w-[36ch] text-balance text-body leading-relaxed text-chalk-muted" style={riseStyle(3)}>
            Pact connects brands with contributors, turns campaign expectations into agreements both sides sign, and keeps
            delivery and payment records together.
          </p>

          <div className="rise mt-7 w-full space-y-2.5" style={riseStyle(4)}>
            {error && <ErrorNotice error={error} />}
            <div className="grid grid-cols-2 gap-2.5">
              <Button size="lg" busy={connecting} onClick={() => enter('BRAND')} className="px-3">
                Post a campaign
              </Button>
              <Button variant="secondary" size="lg" disabled={connecting} onClick={() => enter('CONTRIBUTOR')} className="px-3">
                Find opportunities
              </Button>
            </div>
            <Button variant="ghost" fullWidth disabled={connecting} onClick={() => void signInAsDemo()}>
              Explore the demo
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Button>
            <p className="px-2 text-[0.7rem] leading-relaxed text-chalk-faint">
              {inNimiqPay ? (
                <>Continuing asks your Nimiq wallet to sign a short message. It never approves a payment, and PACT never sees your recovery phrase or keys.</>
              ) : (
                <>
                  Signing, posting and paying need the Nimiq Pay app. Here in a browser, the demo shows the whole product
                  with clearly marked sample data.
                </>
              )}
            </p>
          </div>
        </section>

        {/* --- two audiences --------------------------------------------------------- */}
        <section className="mt-12">
          <SectionTitle>Who it’s for</SectionTitle>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Audience
              icon={Briefcase}
              title="Brands and projects"
              lines={['Post paid work, public or invite-only', 'Invite a contributor by @handle or wallet', 'Review submissions, then pay from your wallet']}
            />
            <Audience
              icon={Sparkles}
              title="Contributors"
              lines={['Clippers, editors, designers, writers', 'Read the exact terms before you commit', 'Get paid in NIM or USDT once approved']}
            />
          </div>
        </section>

        {/* --- how it works ---------------------------------------------------------- */}
        <section className="mt-10">
          <SectionTitle>How it works</SectionTitle>
          <ol className="surface grid grid-cols-4 gap-1 px-2 py-3.5">
            {FLOW.map(({ icon: Icon, label, body }, index) => (
              <li key={label} className="relative flex flex-col items-center px-1 text-center">
                {index < FLOW.length - 1 && (
                  <span aria-hidden className="absolute left-[calc(50%+1.25rem)] top-5 h-px w-[calc(100%-2.5rem)] bg-white/[0.1]" />
                )}
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gold/25 bg-gold/10">
                  <Icon aria-hidden className="h-4 w-4 text-gold-bright" />
                </span>
                <span className="mt-2 text-[0.75rem] font-semibold text-chalk">
                  {index + 1}. {label}
                </span>
                <span className="mt-0.5 text-[0.65rem] leading-snug text-chalk-muted">{body}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* --- a campaign, as it looks --------------------------------------------- */}
        <section className="mt-10">
          <SectionTitle
            action={<span className="text-[0.65rem] text-chalk-faint">{isExample ? 'Example' : 'Open now'}</span>}
          >
            A campaign
          </SectionTitle>
          <article className="surface px-4 py-4" aria-label={isExample ? 'Example campaign' : 'Open campaign'}>
            <div className="flex items-center gap-2">
              <span className="rounded-pill bg-white/[0.06] px-2 py-0.5 text-[0.65rem] text-chalk-muted">
                {CATEGORY_LABEL[card.campaign.category]}
              </span>
              <span className="text-[0.7rem] text-chalk-faint">by {card.campaign.ownerName}</span>
            </div>
            <p className="mt-2 text-body font-semibold leading-snug text-chalk">{card.campaign.title}</p>
            <p className="mt-1 line-clamp-2 text-small text-chalk-muted">{card.campaign.brief}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[0.62rem] uppercase tracking-wider text-chalk-faint">Reward per person</p>
                <p className="tabular text-title text-gold-bright">
                  {formatWithCurrency(card.campaign.rewardMinor, card.campaign.currency)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 text-[0.7rem] text-chalk-muted">
                {deadline && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock aria-hidden className="h-3.5 w-3.5" />
                    {deadline.label}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Users aria-hidden className="h-3.5 w-3.5" />
                  {card.budget.open} of {card.budget.slots} spots left
                </span>
              </div>
            </div>
          </article>
        </section>

        {/* --- why to believe it ----------------------------------------------------- */}
        <section className="mt-10 space-y-2.5">
          <SectionTitle>Why the record holds up</SectionTitle>
          <Fact
            icon={FileSignature}
            title="Signed with your wallet"
            body="Each side signs a fingerprint of the exact terms with their Nimiq wallet. Change a term after signing and the signatures no longer count — the agreement says so."
          />
          <Fact
            icon={ScanSearch}
            title="Paid means found on chain"
            body="A wallet sending money marks a payment as sent. It only shows as verified once PACT finds the transaction on the network, for the agreed amount, to the agreed person."
          />
          <Fact
            icon={EyeOff}
            title="Pact holds nothing"
            body="Money goes wallet to wallet. A campaign budget is what a brand says it will pay, not money set aside, and PACT never holds or releases funds. It records the agreement and the payment evidence."
          />
        </section>

        <section className="mt-10">
          <SectionTitle>Appearance</SectionTitle>
          <ThemeSwitch />
        </section>
      </main>
    </div>
  )
}

function Audience({ icon: Icon, title, lines }: { icon: typeof Briefcase; title: string; lines: string[] }) {
  return (
    <div className="surface px-4 py-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
          <Icon aria-hidden className="h-4 w-4 text-gold-bright" />
        </span>
        <p className="text-heading text-chalk">{title}</p>
      </div>
      <ul className="mt-3 space-y-1.5">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-2 text-small text-chalk-muted">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Fact({ icon: Icon, title, body }: { icon: typeof Briefcase; title: string; body: string }) {
  return (
    <div className="surface flex gap-3.5 px-4 py-3.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-gold/10">
        <Icon aria-hidden className="h-4 w-4 text-gold-bright" />
      </span>
      <div className="min-w-0">
        <p className="text-small font-semibold text-chalk">{title}</p>
        <p className="mt-0.5 text-small leading-relaxed text-chalk-muted">{body}</p>
      </div>
    </div>
  )
}

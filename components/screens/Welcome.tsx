'use client'

import { useReducedMotion } from 'framer-motion'
import { ArrowRight, PenLine, Receipt, ShieldCheck } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useSession } from '@/lib/client/session'
import { PactSeal } from '@/components/seal/PactSeal'
import { Button } from '@/components/ui/Button'
import { ErrorNotice } from '@/components/ui/Bits'
import { cn } from '@/lib/cn'

/**
 * First run.
 *
 * This screen has about three seconds to answer "what is this and why is it in my
 * wallet?", so it leads with the thing the product actually makes — a sealed agreement —
 * rendered as large and as alive as it will ever appear. Everything else on the page is
 * arranged to keep the eye on it: the auras drift far too slowly to compete, the orbit
 * rings point inward, and the copy sits directly beneath.
 *
 * Both routes in are offered up front. Someone outside Nimiq Pay — a judge on a laptop —
 * must not hit a dead end, so Explore Demo is a first-class action rather than a
 * consolation prize.
 */

/**
 * Make it, agree to it, prove it — the three things PACT does, in the order they happen.
 *
 * Deliberately one screen rather than three swipes. Both routes in have to be reachable
 * on first paint (see below), and putting two taps in front of "Explore demo" is exactly
 * the dead end this screen exists to avoid.
 */
const MECHANICS = [
  {
    icon: PenLine,
    title: 'Describe it, don’t draft it',
    body: 'Say what you agreed in your own words. PACT turns it into clear terms you can edit.',
  },
  {
    icon: ShieldCheck,
    title: 'Both sides sign it',
    body: 'Each party signs the exact terms with their Nimiq wallet. Neither can later claim it said something else.',
  },
  {
    icon: Receipt,
    title: 'Prove what happened',
    body: 'Track the work, pay from the agreement if money is involved, and end up with a record either of you can share and anyone can check.',
  },
]

/**
 * Staggered entrance without a JS animation loop — the index feeds a CSS delay.
 *
 * Returns a style object rather than props to spread. Spreading `{className, style}` onto
 * an element that already has a `className` silently replaces it, which is how the first
 * version of this lost every layout class on the hero.
 */
const riseStyle = (index: number): CSSProperties => ({ '--rise-index': index }) as CSSProperties

/**
 * Dots orbiting outside the seal.
 *
 * Only on this screen. It is the one place a little theatre earns its keep, and the two
 * rings turning at different speeds give the hero real depth without another asset.
 */
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

export function Welcome() {
  const { signInWithWallet, signInAsDemo, connecting, environment, error } = useSession()
  const reduceMotion = useReducedMotion()
  const inNimiqPay = environment === 'nimiq-pay'

  return (
    <div className="relative min-h-[var(--app-height)] overflow-hidden">
      {/* --- ambient canvas ---------------------------------------------------------- */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className={cn('aura', !reduceMotion && 'aura-drift')}
          style={{
            width: '78vw',
            height: '78vw',
            maxWidth: 460,
            maxHeight: 460,
            top: '-18%',
            left: '-22%',
            background: 'radial-gradient(circle, rgba(233,178,19,0.30), transparent 68%)',
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
            top: '4%',
            right: '-26%',
            background: 'radial-gradient(circle, rgba(5,130,202,0.26), transparent 68%)',
            animationDuration: '31s',
            animationDelay: '-8s',
          }}
        />
        <div
          className={cn('aura', !reduceMotion && 'aura-drift')}
          style={{
            width: '90vw',
            height: '60vw',
            maxWidth: 520,
            maxHeight: 340,
            bottom: '-14%',
            left: '-10%',
            background: 'radial-gradient(circle, rgba(139,123,232,0.18), transparent 70%)',
            animationDuration: '38s',
            animationDelay: '-16s',
          }}
        />
      </div>

      <main className="safe-top relative mx-auto flex min-h-[var(--app-height)] w-full max-w-[34rem] flex-col px-5 pb-6">
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          {/* --- the hero orb ------------------------------------------------------- */}
          <div className="rise relative flex h-[15.5rem] w-[15.5rem] items-center justify-center" style={riseStyle(0)}>
            {/* Still rings still compose well, so reduced motion keeps them and drops
                only the rotation. */}
            <OrbitRing radius={112} count={18} duration={64} moving={!reduceMotion} />
            <OrbitRing radius={92} count={9} duration={44} reverse moving={!reduceMotion} />
            {/* A faint ground plane so the orb sits in space rather than floating on flat black. */}
            <div
              aria-hidden
              className="absolute h-[12rem] w-[12rem] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(233,178,19,0.10), transparent 62%)' }}
            />
            <PactSeal
              status="COMPLETED"
              digest="7c1af49e2b8d0356e4a9f10c8b27d5e3"
              size="lg"
              animate
              label="A completed PACT"
            />
          </div>

          <h1 className="rise mt-9 text-balance text-display-lg text-chalk" style={riseStyle(1)}>
            Make a deal you can{' '}
            <span className={cn(!reduceMotion && 'text-shine')} style={reduceMotion ? { color: '#F7C948' } : undefined}>
              actually track
            </span>
            .
          </h1>

          <p className="rise mt-3.5 max-w-[34ch] text-balance text-body leading-relaxed text-chalk-muted" style={riseStyle(2)}>
            Create clear agreements, coordinate the work, and pay from one shared PACT.
          </p>

          <ul className="mt-9 w-full space-y-2.5 text-left">
            {MECHANICS.map(({ icon: Icon, title, body }, index) => (
              <li
                key={title}
                className="rise relative overflow-hidden rounded-card border border-white/[0.08] bg-white/[0.025] px-4 py-3.5 backdrop-blur-sm"
                style={riseStyle(index + 3)}
              >
                {/* A hairline of light along the top edge — the whole card's sense of material. */}
                <span
                  aria-hidden
                  className="absolute inset-x-6 top-0 h-px"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)' }}
                />
                <div className="flex gap-3.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-gold/10">
                    <Icon aria-hidden className="h-3.5 w-3.5 text-gold-bright" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-small font-semibold text-chalk">{title}</p>
                    <p className="mt-0.5 text-small leading-relaxed text-chalk-muted">{body}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rise safe-bottom space-y-3" style={riseStyle(6)}>
          {error && <ErrorNotice error={error} />}

          <Button size="lg" fullWidth busy={connecting} onClick={() => void signInWithWallet()}>
            Create your first PACT
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Button>

          <Button variant="secondary" size="lg" fullWidth disabled={connecting} onClick={() => void signInAsDemo()}>
            Explore demo
          </Button>

          <p className="px-2 pt-1 text-center text-[0.7rem] leading-relaxed text-chalk-faint">
            {inNimiqPay ? (
              <>Signing in asks your wallet to sign a short message. It never approves a payment.</>
            ) : (
              <>
                You’re outside Nimiq Pay, so signing and payments aren’t available here. The demo shows the full product
                with sample data.
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  )
}

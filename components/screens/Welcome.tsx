'use client'

import { motion } from 'framer-motion'
import { ArrowRight, PenLine, Receipt, ShieldCheck } from 'lucide-react'
import { useSession } from '@/lib/client/session'
import { PactSeal } from '@/components/seal/PactSeal'
import { Button } from '@/components/ui/Button'
import { ErrorNotice } from '@/components/ui/Bits'

/**
 * First run.
 *
 * The job of this screen is to answer "what is this and why is it in my wallet?" before
 * the user has to tap anything. So: the seal (which is the product), one sentence of
 * plain English, and the three mechanics stated as facts rather than marketing.
 *
 * Both routes in are offered up front. Someone who is not inside Nimiq Pay — a judge on
 * a laptop, say — must not hit a dead end, so Explore Demo is a first-class action rather
 * than a consolation prize.
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
    title: 'Payments land on the record',
    body: 'Pay from the agreement itself. Every payment is tied to the milestone it settles.',
  },
]

export function Welcome() {
  const { signInWithWallet, signInAsDemo, connecting, environment, error } = useSession()
  const inNimiqPay = environment === 'nimiq-pay'

  return (
    <main className="safe-top mx-auto flex min-h-[var(--app-height)] w-full max-w-[34rem] flex-col px-5 pb-6">
      <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* A completed seal: this is what the product produces. */}
          <PactSeal status="COMPLETED" digest="7c1af49e2b8d0356e4a9f10c8b27d5e3" size="lg" animate />
        </motion.div>

        <motion.h1
          className="mt-8 text-balance text-display-lg text-chalk"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Make a deal you can actually track.
        </motion.h1>

        <motion.p
          className="mt-3.5 max-w-[36ch] text-balance text-body leading-relaxed text-chalk-muted"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Create clear agreements, coordinate the work, and pay from one shared PACT.
        </motion.p>

        <motion.ul
          className="mt-9 w-full space-y-3 text-left"
          initial="hidden"
          animate="shown"
          variants={{ shown: { transition: { staggerChildren: 0.08, delayChildren: 0.35 } } }}
        >
          {MECHANICS.map(({ icon: Icon, title, body }) => (
            <motion.li
              key={title}
              variants={{ hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="surface-quiet flex gap-3.5 px-4 py-3.5"
            >
              <Icon aria-hidden className="mt-0.5 h-4.5 w-4.5 shrink-0 text-gold" style={{ width: 18, height: 18 }} />
              <div className="min-w-0">
                <p className="text-small font-semibold text-chalk">{title}</p>
                <p className="mt-0.5 text-small leading-relaxed text-chalk-muted">{body}</p>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>

      <motion.div
        className="safe-bottom space-y-3"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
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
      </motion.div>
    </main>
  )
}

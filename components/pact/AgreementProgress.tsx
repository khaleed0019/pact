'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { relativeTime } from '@/lib/format'
import type { PactDetail } from '@/lib/pact/types'
import { progressOf } from '@/lib/pact/progress'
import { cn } from '@/lib/cn'

export function AgreementProgress({ pact }: { pact: PactDetail }) {
  const reduceMotion = useReducedMotion()
  const steps = progressOf(pact)
  const stopped = pact.status === 'DECLINED' || pact.status === 'CANCELLED'

  return (
    <div className="surface px-4 py-4">
      {stopped && (
        <p className="mb-3 rounded-lg bg-white/[0.04] px-3 py-2 text-[0.75rem] text-chalk-muted">
          This agreement was {pact.status.toLowerCase()}. Nothing after this point will happen.
        </p>
      )}
      {pact.status === 'DISPUTED' && (
        <p className="mb-3 rounded-lg bg-rose/10 px-3 py-2 text-[0.75rem] text-rose">An issue is open. See it below.</p>
      )}
      <ol className="relative">
        {steps.map((step, index) => {
          const last = index === steps.length - 1
          return (
            <motion.li
              key={step.key}
              initial={reduceMotion ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex gap-3 pb-4 last:pb-0"
              aria-current={step.state === 'current' ? 'step' : undefined}
            >
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-[0.6875rem] top-6 h-[calc(100%-1.25rem)] w-px',
                    step.state === 'done' ? 'bg-jade/50' : 'bg-white/[0.08]',
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  'relative z-[1] mt-0.5 flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-full border text-[0.6rem]',
                  step.state === 'done' && 'border-jade/60 bg-jade/20 text-jade',
                  step.state === 'current' && 'border-gold/70 bg-gold/15 text-gold-bright',
                  step.state === 'attention' && 'border-amber/70 bg-amber/15 text-amber',
                  step.state === 'upcoming' && 'border-white/15 bg-ink-850 text-chalk-faint',
                )}
              >
                {step.state === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn('text-small font-semibold', step.state === 'upcoming' ? 'text-chalk-faint' : 'text-chalk')}>
                    {step.label}
                    <span className="sr-only">
                      {' '}
                      — {step.state === 'done' ? 'done' : step.state === 'current' ? 'in progress' : step.state === 'attention' ? 'needs attention' : 'not yet'}
                    </span>
                  </p>
                  {step.at && <span className="shrink-0 text-[0.65rem] text-chalk-faint">{relativeTime(step.at)}</span>}
                </div>
                <p className="mt-0.5 text-[0.7rem] leading-relaxed text-chalk-muted">{step.detail}</p>
              </div>
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}

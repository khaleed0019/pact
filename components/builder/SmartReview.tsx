'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check, Sparkles, TriangleAlert } from 'lucide-react'
import type { Ambiguity } from '@/lib/ai/schema'
import { AiDisclaimer } from '@/components/ui/Bits'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

/**
 * Smart Review.
 *
 * Every finding must come with a fix the user can take in one tap. A review that only
 * says "this is vague" makes the user do the work twice; one that says "replace it with
 * '10 videos'" is worth the screen space.
 *
 * Findings are advisory, never blocking. The user can send the agreement with all of them
 * outstanding — it is their deal, and an app that refuses to proceed until an AI is happy
 * with the wording is one people learn to route around.
 */

const SEVERITY = {
  high: { ring: 'border-rose/30 bg-rose/[0.07]', dot: 'bg-rose', label: 'Worth fixing' },
  medium: { ring: 'border-amber/30 bg-amber/[0.06]', dot: 'bg-amber', label: 'Consider' },
  low: { ring: 'border-white/10 bg-white/[0.03]', dot: 'bg-chalk-faint', label: 'Optional' },
} as const

export function SmartReview({
  ambiguities,
  verdict,
  source,
  applied,
  onApply,
  busy,
}: {
  ambiguities: Ambiguity[]
  verdict: string
  source: 'model' | 'heuristic'
  /** Indexes the user has already accepted, so they render as done rather than vanishing. */
  applied: Set<number>
  onApply: (ambiguity: Ambiguity, index: number) => void
  busy?: boolean
}) {
  const outstanding = ambiguities.filter((_, index) => !applied.has(index))
  const allClear = ambiguities.length === 0

  return (
    <section className="surface overflow-hidden">
      <header className="flex items-start gap-3 border-b border-white/[0.07] px-4 py-3.5">
        <div
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            allClear ? 'bg-jade/15 text-jade' : 'bg-gold/15 text-gold-bright',
          )}
        >
          {allClear ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Sparkles aria-hidden className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-heading text-chalk">Smart review</h2>
          <p className="mt-0.5 text-small leading-relaxed text-chalk-muted">{verdict}</p>
        </div>
        {outstanding.length > 0 && (
          <span className="tabular mt-0.5 shrink-0 rounded-pill bg-white/[0.07] px-2 py-0.5 text-micro text-chalk-muted">
            {outstanding.length}
          </span>
        )}
      </header>

      <div className="divide-y divide-white/[0.06]">
        <AnimatePresence initial={false}>
          {ambiguities.map((item, index) => {
            const isApplied = applied.has(index)
            const severity = SEVERITY[item.severity]

            return (
              <motion.div
                key={`${item.field}-${index}`}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className={cn('px-4 py-3.5', isApplied && 'opacity-55')}>
                  <div className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className={cn('mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full', isApplied ? 'bg-jade' : severity.dot)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.7rem] uppercase tracking-wider text-chalk-faint">
                        {isApplied ? 'Applied' : severity.label} · {item.field}
                      </p>
                      <p className={cn('mt-1 text-small leading-relaxed text-chalk', isApplied && 'line-through decoration-white/30')}>
                        {item.issue}
                      </p>

                      {item.suggestion && !isApplied && (
                        <div className={cn('mt-2.5 rounded-xl border px-3 py-2.5', severity.ring)}>
                          <p className="text-[0.7rem] uppercase tracking-wider text-chalk-faint">Suggested</p>
                          <p className="mt-1 text-small leading-relaxed text-chalk">{item.suggestion}</p>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="mt-2.5"
                            disabled={busy}
                            onClick={() => onApply(item, index)}
                          >
                            Use this
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {allClear && (
          <div className="flex items-center gap-2.5 px-4 py-3.5">
            <Check aria-hidden className="h-4 w-4 shrink-0 text-jade" />
            <p className="text-small text-chalk-muted">
              Nothing ambiguous stood out. Both sides should be able to read this the same way.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.07] px-4 py-3">
        <AiDisclaimer source={source} />
      </div>
    </section>
  )
}

/** Shown while the review is being generated — the wait is short but not instant. */
export function SmartReviewSkeleton() {
  return (
    <section className="surface px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gold/15">
          <TriangleAlert aria-hidden className="h-3.5 w-3.5 animate-pulse text-gold-bright" />
        </div>
        <div>
          <p className="text-heading text-chalk">Reading your agreement…</p>
          <p className="mt-0.5 text-small text-chalk-muted">Looking for anything two people could read differently.</p>
        </div>
      </div>
    </section>
  )
}

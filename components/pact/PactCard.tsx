'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { PactSeal } from '@/components/seal/PactSeal'
import { Money, StatusPill } from '@/components/ui/Bits'
import { relativeDeadline } from '@/lib/format'
import { normalizeAddress } from '@/lib/nimiq/address'
import { isTerminal } from '@/lib/pact/state'
import { cn } from '@/lib/cn'
import type { Pact } from '@/lib/pact/types'

/**
 * One agreement in a list.
 *
 * The seal comes first because it is the fastest identifier — you recognise the shape of
 * your own deal before you have read its title. After that the card answers, in order,
 * the three questions someone actually has: who is this with, how much, and when.
 *
 * `reason` is set when this pact is waiting on the viewer. It gets its own row and a gold
 * edge rather than being folded into the status pill, because "waiting on you" and "what
 * state is this in" are different pieces of information.
 */
export function PactCard({
  pact,
  viewerAddress,
  reason,
}: {
  pact: Pact
  viewerAddress: string
  reason?: string
}) {
  const wanted = normalizeAddress(viewerAddress)
  const self = pact.participants.find((p) => p.address && normalizeAddress(p.address) === wanted)
  const other = pact.participants.find((p) => p !== self)
  /*
   * A finished agreement has no deadline worth showing. Rendering "3 days overdue" on a
   * completed pact is not just noise — it actively misreports the outcome, and it was
   * doing exactly that on the seeded "Lightroom preset pack" until this check existed.
   */
  const deadline = pact.deadline && !isTerminal(pact.status) ? relativeDeadline(pact.deadline) : null

  return (
    <Link
      href={`/p/${pact.id}`}
      className={cn(
        'surface block px-4 py-3.5 transition-transform duration-150 active:scale-[0.99]',
        reason && 'border-gold/30 bg-gold/[0.04]',
      )}
    >
      <div className="flex items-start gap-3.5">
        <PactSeal status={pact.status} digest={pact.termsDigest} size="sm" className="mt-0.5 shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-heading text-chalk">{pact.title}</h3>
            <ChevronRight aria-hidden className="mt-1 h-4 w-4 shrink-0 text-chalk-faint" />
          </div>

          <p className="mt-0.5 truncate text-small text-chalk-muted">
            {self?.role === 'CLIENT' ? 'You’re paying' : 'You’re delivering'}
            {other ? ` · ${other.displayName}` : ''}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Money minor={pact.totalAmountMinor} currency={pact.currency} size="sm" className="text-chalk" />
            <StatusPill status={pact.status} />
            {deadline && (
              <span
                className={cn(
                  'text-[0.7rem]',
                  deadline.overdue ? 'text-rose' : deadline.soon ? 'text-amber' : 'text-chalk-faint',
                )}
              >
                {deadline.label}
              </span>
            )}
          </div>

          {reason && (
            <p className="mt-2.5 flex items-center gap-1.5 border-t border-white/[0.07] pt-2.5 text-[0.7rem] font-medium text-gold-bright">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-gold-bright" />
              {reason}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

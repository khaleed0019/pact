'use client'

import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  Ban,
  CheckCheck,
  CircleCheck,
  CircleDollarSign,
  FileSignature,
  Handshake,
  Hammer,
  MessageSquareReply,
  Package,
  PenLine,
  Send,
  ThumbsUp,
  XCircle,
} from 'lucide-react'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Activity, ActivityKind } from '@/lib/pact/types'

/**
 * The PACT timeline.
 *
 * This is the artefact the whole product produces: a single, ordered, shared account of
 * what happened. Both parties see the identical list, which is what makes "you never said
 * that" a conversation about a record rather than about memory.
 *
 * Design notes that matter more than they look like they should:
 *  - The connector runs *behind* the icons and stops at the last node, so the sequence
 *    reads as finished rather than trailing off.
 *  - Money events are gold. Nothing else is. In a wallet, the eye should be able to find
 *    every payment in one pass without reading a word.
 *  - Entries animate in on first paint only, staggered. Re-renders don't re-animate,
 *    because a timeline that replays itself every poll is exhausting.
 */

const ICONS: Record<ActivityKind, typeof Handshake> = {
  PACT_CREATED: Handshake,
  PACT_SENT: Send,
  TERMS_ACCEPTED: PenLine,
  PACT_SEALED: FileSignature,
  CHANGES_REQUESTED: MessageSquareReply,
  CHANGES_ACCEPTED: CheckCheck,
  PACT_DECLINED: XCircle,
  WORK_STARTED: Hammer,
  PAYMENT_INITIATED: CircleDollarSign,
  PAYMENT_CONFIRMED: CircleDollarSign,
  PAYMENT_FAILED: AlertTriangle,
  DELIVERY_SUBMITTED: Package,
  DELIVERY_APPROVED: ThumbsUp,
  MILESTONE_COMPLETED: CircleCheck,
  PACT_COMPLETED: CircleCheck,
  PACT_CANCELLED: Ban,
  ISSUE_RAISED: AlertTriangle,
  ISSUE_RESOLVED: Handshake,
}

type Tone = 'gold' | 'jade' | 'azure' | 'rose' | 'violet' | 'neutral'

const TONES: Record<ActivityKind, Tone> = {
  PACT_CREATED: 'neutral',
  PACT_SENT: 'neutral',
  TERMS_ACCEPTED: 'gold',
  PACT_SEALED: 'gold',
  CHANGES_REQUESTED: 'violet',
  CHANGES_ACCEPTED: 'violet',
  PACT_DECLINED: 'rose',
  WORK_STARTED: 'azure',
  PAYMENT_INITIATED: 'gold',
  PAYMENT_CONFIRMED: 'gold',
  PAYMENT_FAILED: 'rose',
  DELIVERY_SUBMITTED: 'azure',
  DELIVERY_APPROVED: 'jade',
  MILESTONE_COMPLETED: 'jade',
  PACT_COMPLETED: 'jade',
  PACT_CANCELLED: 'neutral',
  ISSUE_RAISED: 'rose',
  ISSUE_RESOLVED: 'jade',
}

const TONE_CLASS: Record<Tone, { ring: string; icon: string; glow: string }> = {
  gold: { ring: 'border-gold/40 bg-gold/15', icon: 'text-gold-bright', glow: 'shadow-[0_0_18px_-6px_rgba(233,178,19,0.7)]' },
  jade: { ring: 'border-jade/40 bg-jade/15', icon: 'text-jade', glow: 'shadow-[0_0_18px_-6px_rgba(63,169,142,0.6)]' },
  azure: { ring: 'border-azure/40 bg-azure/15', icon: 'text-azure-bright', glow: '' },
  rose: { ring: 'border-rose/40 bg-rose/15', icon: 'text-rose', glow: '' },
  violet: { ring: 'border-violet/40 bg-violet/15', icon: 'text-violet', glow: '' },
  neutral: { ring: 'border-white/12 bg-white/[0.06]', icon: 'text-chalk-muted', glow: '' },
}

/** Meta keys worth surfacing on the row, in the order they should appear. */
const META_ORDER = ['amount', 'milestone', 'note', 'changes', 'applied', 'reason', 'fingerprint', 'manual', 'link'] as const

function MetaRow({ meta }: { meta: Activity['meta'] }) {
  const entries = META_ORDER.map((key) => [key, meta[key]] as const).filter(
    ([, value]) => value !== null && value !== undefined && value !== '',
  )
  if (entries.length === 0) return null

  return (
    <dl className="mt-1.5 space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 text-[0.7rem] leading-relaxed">
          <dt className="shrink-0 capitalize text-chalk-faint">{key === 'fingerprint' ? 'Fingerprint' : key}</dt>
          <dd
            className={cn(
              'min-w-0 flex-1 break-words text-chalk-muted',
              key === 'fingerprint' && 'break-all font-mono text-[0.65rem]',
            )}
          >
            {String(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function Timeline({ activities }: { activities: Activity[] }) {
  const reduceMotion = useReducedMotion()

  if (activities.length === 0) {
    return <p className="px-1 py-4 text-small text-chalk-muted">Nothing has happened yet.</p>
  }

  return (
    <ol className="relative">
      {activities.map((activity, index) => {
        const Icon = ICONS[activity.kind] ?? Handshake
        const tone = TONE_CLASS[TONES[activity.kind] ?? 'neutral']
        const isLast = index === activities.length - 1

        return (
          <motion.li
            key={activity.id}
            className="relative flex gap-3.5 pb-5 last:pb-0"
            initial={reduceMotion ? false : { opacity: 0, x: -6 }}
            animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index * 0.06, 0.5), duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Connector, drawn behind the node and stopped at the final entry. */}
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[1.0625rem] top-9 bottom-0 w-px bg-gradient-to-b from-white/12 to-white/[0.04]"
              />
            )}

            <span
              className={cn(
                'relative z-10 flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center rounded-full border',
                tone.ring,
                tone.glow,
              )}
            >
              <Icon aria-hidden className={cn('h-4 w-4', tone.icon)} />
            </span>

            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-small font-medium leading-snug text-chalk">{activity.summary}</p>
                <time
                  dateTime={activity.createdAt}
                  className="shrink-0 text-[0.7rem] tabular-nums text-chalk-faint"
                  title={new Date(activity.createdAt).toLocaleString()}
                >
                  {relativeTime(activity.createdAt)}
                </time>
              </div>
              <MetaRow meta={activity.meta} />
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}

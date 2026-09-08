'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  CircleDollarSign,
  MessageSquareReply,
  PackageCheck,
  PenLine,
} from 'lucide-react'
import { useSession } from '@/lib/client/session'
import { api } from '@/lib/client/api'
import { relativeTime } from '@/lib/format'
import { TabBar, TAB_BAR_SPACER } from '@/components/nav/TabBar'
import { EmptyState, SectionTitle, Skeleton } from '@/components/ui/Bits'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import type { Notification, NotificationKind } from '@/lib/pact/types'

/**
 * Activity — Smart Reminders, given an actual screen.
 *
 * The reminder logic (`refreshNotifications` in the repository) already existed: it
 * scans every agreement you're a party to and flags exactly the things worth a nudge —
 * a signature you haven't given, a deadline inside three days, a delivery nobody has
 * reviewed — deduplicated per `(address, pact, reason)` so the same thing is never
 * flagged twice. That data has been riding along in `/api/me` since the dashboard was
 * built; this is the first screen that actually shows it as its own place, across every
 * agreement at once rather than one pact at a time.
 */

const ICONS: Record<NotificationKind, typeof Bell> = {
  ACCEPTANCE_PENDING: PenLine,
  DEADLINE_APPROACHING: CalendarClock,
  MILESTONE_DUE: CircleDollarSign,
  DELIVERY_AWAITING_REVIEW: PackageCheck,
  PAYMENT_DUE: CircleDollarSign,
  NEGOTIATION_AWAITING_REPLY: MessageSquareReply,
  OVERDUE: AlertTriangle,
}

const TONE: Record<NotificationKind, string> = {
  ACCEPTANCE_PENDING: 'text-amber',
  DEADLINE_APPROACHING: 'text-amber',
  MILESTONE_DUE: 'text-gold-bright',
  DELIVERY_AWAITING_REVIEW: 'text-azure-bright',
  PAYMENT_DUE: 'text-gold-bright',
  NEGOTIATION_AWAITING_REPLY: 'text-violet',
  OVERDUE: 'text-rose',
}

export default function ActivityPage() {
  const { me, loading, refresh } = useSession()
  const [readingAll, setReadingAll] = useState(false)
  const [localRead, setLocalRead] = useState<Set<string>>(new Set())

  const notifications = useMemo(() => me?.notifications ?? [], [me?.notifications])
  const unread = notifications.filter((n) => n.readAt === null && !localRead.has(n.id))

  const markRead = async (notification: Notification) => {
    if (notification.readAt || localRead.has(notification.id)) return
    setLocalRead((current) => new Set(current).add(notification.id))
    try {
      await api(`/api/notifications/${notification.id}`, { method: 'PATCH' })
    } catch {
      // A failed mark-as-read is not worth interrupting anyone over — worst case it
      // shows as unread again next refresh, which is a harmless, self-correcting state.
    }
  }

  const markAllRead = async () => {
    setReadingAll(true)
    try {
      await Promise.all(unread.map((n) => api(`/api/notifications/${n.id}`, { method: 'PATCH' })))
      setLocalRead((current) => new Set([...current, ...unread.map((n) => n.id)]))
      await refresh()
    } finally {
      setReadingAll(false)
    }
  }

  if (loading) {
    return (
      <main className={cn('mx-auto w-full max-w-[34rem] px-5 py-6', TAB_BAR_SPACER)}>
        <Skeleton className="h-8 w-40" />
        <div className="mt-5 space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </main>
    )
  }

  return (
    <>
      <main className={cn('mx-auto w-full max-w-[34rem] px-5', TAB_BAR_SPACER)}>
        <header className="safe-top flex items-center justify-between gap-3 py-4">
          <h1 className="text-display text-chalk">Activity</h1>
          {unread.length > 0 && (
            <Button variant="quiet" size="sm" busy={readingAll} onClick={() => void markAllRead()}>
              Mark all read
            </Button>
          )}
        </header>

        {notifications.length === 0 ? (
          <div className="surface">
            <EmptyState
              icon={<Bell className="h-8 w-8" />}
              title="Nothing waiting"
              body="Reminders show up here when something needs you — a signature, a deadline inside three days, a delivery nobody has reviewed yet."
            />
          </div>
        ) : (
          <section>
            <SectionTitle>{unread.length > 0 ? `${unread.length} unread` : 'All caught up'}</SectionTitle>
            <div className="surface divide-y divide-white/[0.06]">
              {notifications.map((notification, index) => {
                const Icon = ICONS[notification.kind] ?? Bell
                const isUnread = notification.readAt === null && !localRead.has(notification.id)

                return (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.3 }}
                  >
                    <Link
                      href={`/p/${notification.pactId}`}
                      onClick={() => void markRead(notification)}
                      className={cn('flex items-start gap-3 px-4 py-3.5 active:bg-white/[0.03]', isUnread && 'bg-gold/[0.03]')}
                    >
                      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06]', TONE[notification.kind])}>
                        <Icon aria-hidden className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-small leading-snug', isUnread ? 'font-semibold text-chalk' : 'text-chalk-muted')}>
                          {notification.title}
                        </p>
                        <p className="mt-0.5 text-small leading-snug text-chalk-muted">{notification.body}</p>
                        <p className="mt-1 text-[0.7rem] text-chalk-faint">{relativeTime(notification.createdAt)}</p>
                      </div>
                      {isUnread ? (
                        <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold-bright" />
                      ) : (
                        <Check aria-hidden className="mt-1.5 h-3.5 w-3.5 shrink-0 text-chalk-faint" />
                      )}
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          </section>
        )}
      </main>
      <TabBar />
    </>
  )
}

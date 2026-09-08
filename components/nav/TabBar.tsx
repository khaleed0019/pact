'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, FileStack, Home, Plus, UserRound } from 'lucide-react'
import { useSession } from '@/lib/client/session'
import { cn } from '@/lib/cn'

/**
 * The bottom tab bar.
 *
 * Five destinations, matching what the product actually has rather than filling slots
 * for their own sake:
 *
 *   HOME     the Command Center — what needs you, right now
 *   PACTS    every agreement you're part of, not just the ones asking for attention
 *   CREATE   the AI Pact Builder — raised, because starting a new PACT is the one action
 *            that should never be more than a thumb's reach away, on any screen this bar
 *            appears on
 *   ACTIVITY reminders and deadlines across every agreement (see app/activity) — this is
 *            Smart Reminders' actual screen; the data already existed in `/api/me` and
 *            had nowhere to be seen before this
 *   YOU      the trust profile — your record, not a vanity "profile" tab
 *
 * Only rendered on screens with room for it: the dashboard, the full pacts list, activity
 * and the trust profile. Not on the Builder (which already ends in one big primary
 * button), not on a pact's own detail page (whose primary action is contextual and
 * already pinned to the same thumb zone), and not on the invite or welcome screens.
 */

const NAV_HEIGHT = '4.5rem'

interface Tab {
  href: string
  label: string
  icon: typeof Home
  match: (pathname: string) => boolean
}

const TABS: Tab[] = [
  { href: '/', label: 'Home', icon: Home, match: (p) => p === '/' },
  { href: '/pacts', label: 'Pacts', icon: FileStack, match: (p) => p.startsWith('/pacts') },
  { href: '/activity', label: 'Activity', icon: Bell, match: (p) => p.startsWith('/activity') },
  { href: '/trust', label: 'You', icon: UserRound, match: (p) => p.startsWith('/trust') },
]

export function TabBar() {
  const pathname = usePathname()
  const { me } = useSession()
  const unread = me?.notifications?.filter((n) => n.readAt === null).length ?? 0

  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)]

  return (
    <nav
      aria-label="Primary"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[34rem] border-t border-white/[0.07] bg-ink-900/92 backdrop-blur-lg"
      style={{ paddingTop: '0.4rem' }}
    >
      <div className="relative grid grid-cols-5 items-start" style={{ height: NAV_HEIGHT }}>
        {left.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={tab.match(pathname)} badge={tab.href === '/activity' ? unread : 0} />
        ))}

        {/* Raised centre action — always Create, never a toggled "active" state of its own. */}
        <div className="flex items-start justify-center">
          <Link
            href="/new"
            aria-label="Create a PACT"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-gold-bright to-gold text-ink-950 shadow-glow-gold ring-4 ring-ink-900 transition-transform duration-150 active:scale-95"
          >
            <Plus aria-hidden className="h-6 w-6" strokeWidth={2.5} />
          </Link>
        </div>

        {right.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={tab.match(pathname)} badge={tab.href === '/activity' ? unread : 0} />
        ))}
      </div>
    </nav>
  )
}

function TabLink({ tab, active, badge }: { tab: Tab; active: boolean; badge: number }) {
  const Icon = tab.icon
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className="flex min-h-tap flex-col items-center gap-1 pt-1.5 text-center"
    >
      <span className="relative">
        <Icon aria-hidden className={cn('h-5 w-5', active ? 'text-gold-bright' : 'text-chalk-faint')} strokeWidth={active ? 2.4 : 2} />
        {badge > 0 && (
          <span
            aria-hidden
            className="tabular absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose px-1 text-[0.55rem] font-semibold text-white"
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span className={cn('text-[0.65rem] font-medium tracking-wide', active ? 'text-gold-bright' : 'text-chalk-faint')}>
        {tab.label}
        {badge > 0 && <span className="sr-only"> — {badge} unread</span>}
      </span>
    </Link>
  )
}

/** Bottom padding so page content clears the fixed bar. Use on every screen that renders it. */
export const TAB_BAR_SPACER = 'pb-24'

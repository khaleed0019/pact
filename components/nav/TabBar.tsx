'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { Bell, Briefcase, Home, Plus, Search, UserRound } from 'lucide-react'
import { useSession } from '@/lib/client/session'
import { cn } from '@/lib/cn'

/**
 * Primary navigation.
 *
 * On a phone it is a floating glass capsule above the home indicator: five targets, the
 * raised centre one the action this role most often starts with. It floats rather than
 * spanning the edge so content visibly continues beneath it, and pages reserve
 * `TAB_BAR_SPACER` so nothing actionable ever ends up hidden behind it.
 *
 * On a wide screen, an iPhone capsule would be an imitation, so the same destinations
 * become a conventional top bar.
 *
 * The labels follow the role. A brand's centre action is posting work; a contributor's
 * is finding it. The routes are the same — what changes is what the button says it does.
 */

interface Tab {
  href: string
  label: string
  icon: typeof Home
  match: (pathname: string) => boolean
}

function tabsFor(role: 'BRAND' | 'CONTRIBUTOR' | null | undefined): { tabs: Tab[]; centre: { href: string; label: string } } {
  const work: Tab =
    role === 'BRAND'
      ? { href: '/campaigns', label: 'Campaigns', icon: Briefcase, match: (p) => p.startsWith('/campaigns') }
      : { href: '/campaigns', label: 'Find work', icon: Search, match: (p) => p.startsWith('/campaigns') }
  return {
    tabs: [
      { href: '/', label: 'Home', icon: Home, match: (p) => p === '/' },
      work,
      { href: '/activity', label: 'Activity', icon: Bell, match: (p) => p.startsWith('/activity') },
      { href: '/trust', label: 'You', icon: UserRound, match: (p) => p.startsWith('/trust') },
    ],
    centre: role === 'BRAND' ? { href: '/campaigns/new', label: 'Post work' } : { href: '/new', label: 'Create a PACT' },
  }
}

export function TabBar() {
  const pathname = usePathname()
  const { me } = useSession()
  const reduceMotion = useReducedMotion()
  const unread = me?.notifications?.filter((n) => n.readAt === null).length ?? 0
  const { tabs, centre } = tabsFor(me?.role)
  const [left, right] = [tabs.slice(0, 2), tabs.slice(2)]

  return (
    <>
      {/* Phone: floating capsule. */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
        <div className="glass-strong relative mx-auto grid max-w-[24rem] grid-cols-5 items-center rounded-[1.75rem] px-1.5 py-1.5">
          {left.map((tab) => (
            <TabLink key={tab.href} tab={tab} active={tab.match(pathname)} badge={tab.href === '/activity' ? unread : 0} animate={!reduceMotion} />
          ))}
          <div className="flex justify-center">
            <Link
              href={centre.href}
              aria-label={centre.label}
              className="focus-ring flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-sun-light to-sun text-onsun shadow-glow-gold transition-transform duration-150 active:scale-95"
            >
              <Plus aria-hidden className="h-6 w-6" strokeWidth={2.5} />
            </Link>
          </div>
          {right.map((tab) => (
            <TabLink key={tab.href} tab={tab} active={tab.match(pathname)} badge={tab.href === '/activity' ? unread : 0} animate={!reduceMotion} />
          ))}
        </div>
      </nav>

      {/* Wide screens: a plain top bar. */}
      <nav aria-label="Primary" className="glass-strong fixed inset-x-0 top-0 z-30 hidden border-x-0 border-t-0 md:block">
        <div className="mx-auto flex h-14 max-w-[56rem] items-center gap-1 px-6">
          <Link href="/" className="focus-ring mr-4 rounded-lg text-heading font-semibold tracking-tight text-chalk">
            PACT
          </Link>
          {tabs.map((tab) => {
            const active = tab.match(pathname)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-ring relative rounded-lg px-3 py-2 text-small font-medium transition-colors',
                  active ? 'text-chalk' : 'text-chalk-muted hover:text-chalk',
                )}
              >
                {tab.label}
                {tab.href === '/activity' && unread > 0 && (
                  <span className="tabular ml-1.5 rounded-full bg-rose px-1.5 text-[0.6rem] font-semibold text-[#fff]">{unread}</span>
                )}
                {active && <span aria-hidden className="absolute inset-x-3 -bottom-[0.6rem] h-0.5 rounded-full bg-gold" />}
              </Link>
            )
          })}
          <Link href={centre.href} className="ml-auto">
            <span className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-b from-sun-light to-sun px-3.5 text-small font-semibold text-onsun">
              <Plus aria-hidden className="h-4 w-4" strokeWidth={2.5} />
              {centre.label}
            </span>
          </Link>
        </div>
      </nav>
    </>
  )
}

function TabLink({ tab, active, badge, animate }: { tab: Tab; active: boolean; badge: number; animate: boolean }) {
  const Icon = tab.icon
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className="focus-ring relative flex min-h-tap flex-col items-center justify-center gap-0.5 rounded-2xl py-1 text-center"
    >
      {active && (
        <motion.span
          layoutId={animate ? 'tab-highlight' : undefined}
          aria-hidden
          className="absolute inset-0 rounded-2xl bg-white/[0.07]"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        />
      )}
      <span className="relative">
        <Icon aria-hidden className={cn('h-5 w-5', active ? 'text-gold-bright' : 'text-chalk-faint')} strokeWidth={active ? 2.4 : 2} />
        {badge > 0 && (
          <span
            aria-hidden
            className="tabular absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose px-1 text-[0.55rem] font-semibold text-[#fff]"
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span className={cn('relative text-[0.62rem] font-medium tracking-wide', active ? 'text-gold-bright' : 'text-chalk-faint')}>
        {tab.label}
        {badge > 0 && <span className="sr-only"> — {badge} unread</span>}
      </span>
    </Link>
  )
}

/**
 * Space pages reserve so content clears the bar: bottom on phones (capsule + its margin),
 * top on wide screens (the fixed top bar). Use on every screen that renders it.
 */
export const TAB_BAR_SPACER = 'pb-28 md:pb-10 md:pt-16'

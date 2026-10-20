'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, LogOut, Repeat2, UserRound } from 'lucide-react'
import { useSession } from '@/lib/client/session'
import { shortenAddress as shortAddress } from '@/lib/nimiq/address'
import { ROLE_META } from '@/lib/pact/roles'
import { cn } from '@/lib/cn'

/**
 * The wallet capsule: who you are signed in as, and in which role.
 *
 * Shows only what PACT actually knows — the address the wallet signed in with and the
 * role saved for it. No balance: the Mini App SDK exposes no balance call, and a number
 * PACT made up would be worse than none.
 *
 * The menu is a real popover: Escape and an outside tap close it, focus returns to the
 * trigger, and every item does what it says.
 */
export function WalletCapsule({ onSwitchRole }: { onSwitchRole: () => void }) {
  const { me, signOut } = useSession()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  if (!me?.address) return null
  const role = me.role ? ROLE_META[me.role].label : null

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="glass focus-ring flex min-h-tap items-center gap-2 rounded-pill py-1.5 pl-2.5 pr-2"
      >
        <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', me.demo ? 'bg-amber' : 'bg-jade')} />
        <span className="font-mono text-[0.7rem] text-chalk">{me.demo ? 'Demo' : shortAddress(me.address)}</span>
        {role && (
          <span className="rounded-pill bg-white/[0.08] px-2 py-0.5 text-[0.65rem] font-medium text-chalk-muted">{role}</span>
        )}
        <ChevronDown aria-hidden className={cn('h-3.5 w-3.5 text-chalk-faint transition-transform', open && 'rotate-180')} />
        <span className="sr-only">Account menu</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 origin-top-right rounded-card p-1.5"
          >
            <div className="px-3 py-2.5">
              <p className="text-[0.65rem] uppercase tracking-wider text-chalk-faint">
                {me.demo ? 'Demo session' : 'Signed in with Nimiq'}
              </p>
              <p className="mt-1 break-all font-mono text-[0.68rem] leading-relaxed text-chalk-muted">{me.address}</p>
            </div>
            <div className="my-1 h-px bg-white/[0.07]" />
            <Link
              role="menuitem"
              href="/trust"
              onClick={() => setOpen(false)}
              className="focus-ring flex min-h-tap items-center gap-2.5 rounded-xl px-3 text-small text-chalk active:bg-white/[0.06]"
            >
              <UserRound aria-hidden className="h-4 w-4 text-chalk-faint" />
              Profile and record
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                onSwitchRole()
              }}
              className="focus-ring flex min-h-tap w-full items-center gap-2.5 rounded-xl px-3 text-left text-small text-chalk active:bg-white/[0.06]"
            >
              <Repeat2 aria-hidden className="h-4 w-4 text-chalk-faint" />
              {role ? `Switch from ${role}` : 'Choose a role'}
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                void signOut()
              }}
              className="focus-ring flex min-h-tap w-full items-center gap-2.5 rounded-xl px-3 text-left text-small text-rose active:bg-white/[0.06]"
            >
              <LogOut aria-hidden className="h-4 w-4" />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

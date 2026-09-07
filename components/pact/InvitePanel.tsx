'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, Share2 } from 'lucide-react'
import { PactSeal } from '@/components/seal/PactSeal'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Bits'
import type { Pact } from '@/lib/pact/types'

/**
 * The invitation — PACT's growth loop.
 *
 * An agreement needs two people, so every pact created is an invitation to someone who
 * may not have Nimiq Pay yet. That makes this screen the most important growth surface in
 * the product, and the reason the link format matters:
 *
 *   https://nimpay.app/miniapps/open/<host>/i/<token>
 *
 * That is Nimiq Pay's documented deep link. Someone who already has the app lands
 * straight inside the Mini App with the agreement open; someone who doesn't gets a page
 * that tells them what they're being asked to agree to before anything is installed.
 *
 * The share text is written to be forwarded as-is into WhatsApp or Telegram, because
 * that is where these deals actually get made.
 */
export function InvitePanel({ pact, token, onDone }: { pact: Pact; token: string; onDone: () => void }) {
  const [copied, setCopied] = useState<'link' | 'message' | null>(null)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const links = useMemo(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin
    const host = origin.replace(/^https?:\/\//, '')
    const web = `${origin}/i/${token}`
    return {
      web,
      // Opens directly inside Nimiq Pay for anyone who already has it installed.
      nimiqPay: `https://nimpay.app/miniapps/open/${host}/i/${token}`,
    }
  }, [token])

  const message = useMemo(
    () =>
      [
        `I've set up a PACT for "${pact.title}".`,
        '',
        'It lays out exactly what we agreed — what gets delivered, for how much, and by when.',
        'Open it, check the terms, and sign if you agree:',
        '',
        links.nimiqPay,
      ].join('\n'),
    [pact.title, links.nimiqPay],
  )

  const copy = async (value: string, which: 'link' | 'message') => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(which)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard access can be denied in a WebView; the text is selectable on screen.
    }
  }

  const share = async () => {
    try {
      await navigator.share({ title: `PACT — ${pact.title}`, text: message })
    } catch {
      // A dismissed share sheet is a normal outcome, not an error worth reporting.
    }
  }

  return (
    <div className="py-8">
      <motion.div
        className="flex flex-col items-center text-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <PactSeal status={pact.status} digest={pact.termsDigest} size="lg" animate />

        <h1 className="mt-7 text-display text-chalk">Your PACT is ready.</h1>
        <p className="mt-2.5 max-w-[34ch] text-balance text-body leading-relaxed text-chalk-muted">
          Send it to {pact.participants.find((p) => p.joinedAt === null)?.displayName ?? 'the other party'}. Once they
          sign, the terms are locked for both of you.
        </p>
      </motion.div>

      <div className="surface mt-7 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-heading text-chalk">{pact.title}</p>
            <p className="mt-0.5 font-mono text-[0.7rem] text-chalk-faint">Ref {pact.shortId}</p>
          </div>
          <Money minor={pact.totalAmountMinor} currency={pact.currency} size="lg" className="shrink-0 text-gold-bright" />
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {canShare && (
          <Button size="lg" fullWidth onClick={() => void share()}>
            <Share2 aria-hidden className="h-4 w-4" />
            Share invitation
          </Button>
        )}

        <Button variant={canShare ? 'secondary' : 'primary'} size="lg" fullWidth onClick={() => void copy(message, 'message')}>
          {copied === 'message' ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
          {copied === 'message' ? 'Message copied' : 'Copy invitation message'}
        </Button>

        <button
          type="button"
          onClick={() => void copy(links.nimiqPay, 'link')}
          className="surface-quiet flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-white/[0.06]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-micro uppercase tracking-wider text-chalk-faint">Opens in Nimiq Pay</span>
            <span className="mt-0.5 block truncate font-mono text-[0.7rem] text-chalk-muted">{links.nimiqPay}</span>
          </span>
          {copied === 'link' ? (
            <Check aria-hidden className="h-4 w-4 shrink-0 text-jade" />
          ) : (
            <Copy aria-hidden className="h-4 w-4 shrink-0 text-chalk-faint" />
          )}
        </button>
      </div>

      <Button variant="quiet" fullWidth className="mt-5" onClick={onDone}>
        Go to the agreement
      </Button>
    </div>
  )
}

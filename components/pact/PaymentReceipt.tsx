'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Check, CircleCheck, Clock3, Copy, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { api } from '@/lib/client/api'
import { formatWithCurrency } from '@/lib/pact/money'
import { relativeTime } from '@/lib/format'
import { explorerUrl } from '@/lib/nimiq/evm'
import { shortenAddress } from '@/lib/nimiq/address'
import { EVM_CHAINS } from '@/lib/pact/types'
import type { Payment, PaymentStatus } from '@/lib/pact/types'
import { cn } from '@/lib/cn'

/**
 * A payment, as a receipt.
 *
 * The state shown is the stored one, which only the server's chain check can move to
 * CONFIRMED (see lib/api/reconcile.ts). Each state has its own icon *and* words, so it is
 * never told apart by colour alone, and "sent" never borrows the look of "verified".
 *
 * The explorer link is offered only where PACT knows the right URL: USDT on its chain's
 * explorer, from the configured chain table. For NIM the hash is shown with a copy
 * action instead of a link PACT has not verified resolves.
 */

const STATE: Record<PaymentStatus, { label: string; tone: string; icon: typeof Check; note: string }> = {
  PENDING: {
    label: 'Not sent yet',
    tone: 'border-white/10 bg-white/[0.04] text-chalk-muted',
    icon: Clock3,
    note: 'Recorded before the wallet opened. Nothing has left a wallet.',
  },
  SUBMITTED: {
    label: 'Sent — confirming',
    tone: 'border-amber/35 bg-amber/10 text-amber',
    icon: Loader2,
    note: 'The wallet sent it. PACT marks it paid only once it finds it on the network.',
  },
  CONFIRMED: {
    label: 'Verified on the network',
    tone: 'border-jade/40 bg-jade/[0.12] text-jade',
    icon: CircleCheck,
    note: 'PACT found this transaction on the network: right recipient, right amount.',
  },
  FAILED: {
    label: 'Needs attention',
    tone: 'border-rose/35 bg-rose/10 text-rose',
    icon: AlertTriangle,
    note: 'This did not match the agreement.',
  },
  CANCELLED: {
    label: 'Cancelled',
    tone: 'border-white/10 bg-white/[0.04] text-chalk-muted',
    icon: XCircle,
    note: 'Cancelled before anything was sent.',
  },
}

export function PaymentReceipt({ payment, onChecked }: { payment: Payment; onChecked: () => void }) {
  const reduceMotion = useReducedMotion()
  const [copied, setCopied] = useState(false)
  const [checking, setChecking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // Seeded demo payments carry a `demo:` reference. They are examples, not chain records,
  // and the receipt must not claim the network confirmed something that never existed.
  const demo = payment.txReference?.startsWith('demo:') ?? false
  const meta = demo
    ? {
        label: 'Demo payment',
        tone: 'border-white/10 bg-white/[0.04] text-chalk-muted',
        icon: Clock3,
        note: 'Sample data. No transaction exists for this payment.',
      }
    : STATE[payment.status]
  const Icon = meta.icon
  const isHash = payment.txReference && /^(0x)?[0-9a-fA-F]{64}$/.test(payment.txReference)

  const copy = async () => {
    if (!payment.txReference) return
    try {
      await navigator.clipboard.writeText(payment.txReference)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Blocked clipboard in a WebView: the reference is on screen regardless.
    }
  }

  const check = async () => {
    setChecking(true)
    setNote(null)
    try {
      const result = await api<{ payment: Payment; verification: { state: string; reason?: string } | null }>(
        `/api/payments/${payment.id}/verify`,
        { method: 'POST' },
      )
      if (result.payment.status === 'SUBMITTED') setNote(result.verification?.reason ?? 'Not on the network yet. Try again shortly.')
      onChecked()
    } catch {
      setNote('Couldn’t reach the network just now. Nothing has changed — try again in a moment.')
    }
    setChecking(false)
  }

  return (
    <motion.article
      layout={!reduceMotion}
      className="surface overflow-hidden"
      aria-label={`Payment of ${formatWithCurrency(payment.amountMinor, payment.currency)}, ${meta.label}`}
    >
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <p className="tabular text-title text-chalk">{formatWithCurrency(payment.amountMinor, payment.currency)}</p>
          <p className="mt-0.5 text-[0.7rem] text-chalk-faint">
            {payment.chain ? `USDT on ${EVM_CHAINS[payment.chain].name}` : 'NIM on Nimiq'} · {relativeTime(payment.updatedAt)}
          </p>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium', meta.tone)}>
          <Icon aria-hidden className={cn('h-3.5 w-3.5', payment.status === 'SUBMITTED' && !reduceMotion && 'animate-spin')} />
          {meta.label}
        </span>
      </div>

      <dl className="divide-y divide-white/[0.06] border-t border-white/[0.06] text-small">
        <Row label="From">
          <span className="font-mono text-[0.7rem] text-chalk-muted">{shortenAddress(payment.fromAddress)}</span>
        </Row>
        <Row label="To">
          <span className="font-mono text-[0.7rem] text-chalk-muted">{shortenAddress(payment.toAddress)}</span>
        </Row>
        {payment.memo && (
          <Row label="On-chain memo">
            <span className="font-mono text-[0.7rem] text-chalk-muted">{payment.memo}</span>
          </Row>
        )}
        {payment.txReference && (
          <div className="px-4 py-2.5">
            <dt className="text-[0.7rem] text-chalk-faint">{demo ? 'Demo reference' : isHash ? 'Transaction hash' : 'Wallet reference'}</dt>
            <dd className="mt-1 flex items-start gap-2">
              <span className="min-w-0 flex-1 break-all font-mono text-[0.68rem] leading-relaxed text-chalk-muted">
                {payment.txReference.length > 140 ? `${payment.txReference.slice(0, 140)}…` : payment.txReference}
              </span>
              <button
                type="button"
                onClick={() => void copy()}
                aria-label="Copy transaction reference"
                className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-chalk-faint active:bg-white/10"
              >
                {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-jade" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
              </button>
            </dd>
          </div>
        )}
      </dl>

      <div className="space-y-2 border-t border-white/[0.06] px-4 py-3">
        <p className="text-[0.7rem] leading-relaxed text-chalk-muted">
          {payment.status === 'FAILED' && payment.failureReason ? payment.failureReason : meta.note}
        </p>
        {note && <p className="text-[0.7rem] leading-relaxed text-amber">{note}</p>}
        <div className="flex flex-wrap gap-3">
          {payment.status === 'SUBMITTED' && (
            <button
              type="button"
              onClick={() => void check()}
              disabled={checking}
              className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg text-small font-medium text-gold-bright disabled:opacity-50"
            >
              {checking && <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              {checking ? 'Checking the network…' : 'Check payment status'}
            </button>
          )}
          {payment.chain && payment.txReference?.startsWith('0x') && (
            <a
              href={explorerUrl(payment.chain, payment.txReference)}
              target="_blank"
              rel="noreferrer noopener"
              className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg text-small font-medium text-azure-bright underline underline-offset-4"
            >
              View on {EVM_CHAINS[payment.chain].name}
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </motion.article>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-[0.7rem] text-chalk-faint">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  )
}

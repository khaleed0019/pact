'use client'

import { AlertTriangle, Check, Copy, Info, ShieldAlert, WifiOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { formatDigest } from '@/lib/pact/digest'
import { formatAddress, shortenAddress } from '@/lib/nimiq/address'
import { formatAmount } from '@/lib/pact/money'
import { STATUS_META } from '@/lib/pact/state'
import type { Currency, PactStatus } from '@/lib/pact/types'
import type { UserFacingError } from '@/lib/errors'

/** Small shared pieces. Each one exists because the same thing was needed three times. */

const TONES = {
  neutral: 'bg-white/[0.06] text-chalk-muted border-white/10',
  gold: 'bg-gold/12 text-gold-bright border-gold/25',
  azure: 'bg-azure/12 text-azure-bright border-azure/25',
  jade: 'bg-jade/12 text-jade border-jade/25',
  amber: 'bg-amber/12 text-amber border-amber/25',
  rose: 'bg-rose/12 text-rose border-rose/25',
  violet: 'bg-violet/12 text-violet border-violet/25',
} as const

export function StatusPill({ status, className }: { status: PactStatus; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-micro font-medium uppercase tracking-wider',
        TONES[meta.tone],
        className,
      )}
    >
      {meta.label}
    </span>
  )
}

export function Tag({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: keyof typeof TONES
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-micro', TONES[tone], className)}>
      {children}
    </span>
  )
}

/**
 * Money.
 *
 * Always tabular so digits do not shift width as a value updates, and the currency is
 * always adjacent — an amount without its unit is how people end up paying in the wrong
 * asset.
 */
export function Money({
  minor,
  currency,
  className,
  size = 'md',
}: {
  minor: string
  currency: Currency
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const sizes = {
    sm: 'text-small',
    md: 'text-body',
    lg: 'text-title',
    xl: 'text-display',
  }
  return (
    <span className={cn('tabular whitespace-nowrap font-semibold', sizes[size], className)}>
      {formatAmount(minor, currency)}
      <span className="ml-1 font-medium text-chalk-muted">{currency}</span>
    </span>
  )
}

function useCopy() {
  const [copied, setCopied] = useState(false)
  return {
    copied,
    copy: async (value: string) => {
      try {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      } catch {
        // Clipboard can be blocked in a WebView. The value is on screen either way,
        // so failing silently is better than an error toast for a convenience feature.
      }
    },
  }
}

/**
 * The terms fingerprint, rendered for human comparison.
 *
 * Grouped in fours and monospaced so two people can read it to each other or hold two
 * phones side by side. This is the fallback when someone wants certainty beyond "the
 * seals look the same".
 */
export function Fingerprint({ digest, className }: { digest: string; className?: string }) {
  const { copied, copy } = useCopy()
  return (
    <button
      type="button"
      onClick={() => copy(digest)}
      className={cn(
        'group flex w-full items-center gap-2 rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2.5 text-left',
        'active:bg-black/40',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-micro uppercase tracking-wider text-chalk-faint">Terms fingerprint</span>
        <span className="mt-0.5 block break-all font-mono text-[0.7rem] leading-relaxed text-chalk-muted">
          {formatDigest(digest)}
        </span>
      </span>
      {copied ? (
        <Check aria-hidden className="h-4 w-4 shrink-0 text-jade" />
      ) : (
        <Copy aria-hidden className="h-4 w-4 shrink-0 text-chalk-faint" />
      )}
      <span className="sr-only">{copied ? 'Fingerprint copied' : 'Copy fingerprint'}</span>
    </button>
  )
}

export function AddressChip({
  address,
  full = false,
  className,
}: {
  address: string
  full?: boolean
  className?: string
}) {
  const { copied, copy } = useCopy()
  return (
    <button
      type="button"
      onClick={() => copy(formatAddress(address))}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2 py-1 font-mono text-[0.7rem] text-chalk-muted active:bg-white/[0.1]',
        className,
      )}
      title={formatAddress(address)}
    >
      {full ? formatAddress(address) : shortenAddress(address)}
      {copied ? <Check aria-hidden className="h-3 w-3 text-jade" /> : <Copy aria-hidden className="h-3 w-3 opacity-50" />}
    </button>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

/**
 * The direct-payment notice.
 *
 * The framework gives a Mini App no way to hold funds, so PACT must never let a user
 * believe otherwise. This appears on every payment surface, and the honesty check in
 * `scripts/check-honesty.mjs` fails the build if the words it avoids ever creep back in.
 */
export function DirectPaymentNotice({ className }: { className?: string }) {
  return (
    <div className={cn('flex gap-2.5 rounded-xl border border-azure/20 bg-azure/[0.07] px-3.5 py-3', className)}>
      <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-azure-bright" />
      <p className="text-small leading-relaxed text-chalk-muted">
        <span className="font-medium text-chalk">This is a direct payment.</span> The money goes straight from your
        wallet to theirs. PACT records it and links it to this agreement — it never holds your funds and cannot reverse
        a payment.
      </p>
    </div>
  )
}

/** AI output is a drafting aid, and says so wherever it appears. */
export function AiDisclaimer({ source, className }: { source: 'model' | 'heuristic'; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-[0.7rem] leading-relaxed text-chalk-faint', className)}>
      <ShieldAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {source === 'model'
          ? 'Written by AI to help you word things clearly.'
          : 'Generated by PACT’s built-in reader, not an AI model.'}{' '}
        This is not legal advice. Check every field before you sign — you are agreeing to what is on screen.
      </span>
    </p>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-4 text-chalk-faint">{icon}</div>}
      <h3 className="text-heading text-chalk">{title}</h3>
      <p className="mt-1.5 max-w-[34ch] text-small leading-relaxed text-chalk-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/**
 * Error display.
 *
 * A cancellation is styled as information, not failure — the user made a choice and
 * shouting red at them for it is both wrong and alarming when money is involved.
 */
export function ErrorNotice({
  error,
  onRetry,
  className,
}: {
  error: UserFacingError
  onRetry?: () => void
  className?: string
}) {
  const benign = error.benign === true
  const Icon = error.code === 'OFFLINE' ? WifiOff : benign ? Info : AlertTriangle

  return (
    <div
      role={benign ? 'status' : 'alert'}
      className={cn(
        'flex gap-3 rounded-xl border px-3.5 py-3',
        benign ? 'border-white/10 bg-white/[0.04]' : 'border-rose/25 bg-rose/[0.08]',
        className,
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', benign ? 'text-chalk-muted' : 'text-rose')} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-small font-medium', benign ? 'text-chalk' : 'text-rose')}>{error.title}</p>
        <p className="mt-0.5 text-small leading-relaxed text-chalk-muted">{error.body}</p>
        {error.retry && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-small font-medium text-gold-bright underline underline-offset-4"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

/** Section heading used down the whole app, so spacing rhythm stays consistent. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-micro font-semibold uppercase tracking-[0.14em] text-chalk-faint">{children}</h2>
      {action}
    </div>
  )
}

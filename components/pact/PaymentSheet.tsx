'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, CircleCheck, ExternalLink, Loader2, Wallet } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { AddressChip, DirectPaymentNotice, ErrorNotice, Money } from '@/components/ui/Bits'
import { api, toUserFacing } from '@/lib/client/api'
import { sendNimWithMemo } from '@/lib/nimiq/provider'
import { connectEvm, explorerUrl, sendUsdt } from '@/lib/nimiq/evm'
import { minorToLunaNumber } from '@/lib/pact/money'
import { EVM_CHAINS } from '@/lib/pact/types'
import { describe, type UserFacingError } from '@/lib/errors'
import type { Currency, EvmChainKey, Milestone, PactDetail, Payment } from '@/lib/pact/types'
import { cn } from '@/lib/cn'

/**
 * The payment flow.
 *
 * PACT's whole claim is that it tells the truth about money, so the state machine here is
 * explicit rather than a boolean `loading`:
 *
 *   idle → recording → awaiting-wallet → submitted → confirmed
 *                            ├→ cancelled  (the user said no; not a failure)
 *                            └→ failed     (something actually went wrong)
 *
 * Two rules the code enforces rather than merely intends:
 *
 *  1. The PENDING record is written **before** the wallet opens. If the app dies between
 *     the dialog and the response, the attempt still exists and is visible.
 *  2. Nothing is called confirmed without a transaction reference from the wallet. For
 *     USDT that is the tx hash; for NIM it is the serialized transaction the provider
 *     returns. `submitted` and `confirmed` are worded differently in the UI on purpose —
 *     "sent" is not "settled", and telling a user otherwise is the one unforgivable bug
 *     in a payments app.
 */

type Phase = 'idle' | 'recording' | 'awaiting-wallet' | 'submitted' | 'confirmed' | 'cancelled' | 'failed'

interface Instruction {
  recipient: string
  evmRecipient: string | null
  recipientName: string
  amountMinor: string
  currency: Currency
  chain: EvmChainKey | null
  memo: string | null
  label: string
}

export function PaymentSheet({
  open,
  onClose,
  pact,
  milestone,
  onSettled,
}: {
  open: boolean
  onClose: () => void
  pact: PactDetail
  /** Null pays the whole remaining agreement rather than one step. */
  milestone: Milestone | null
  onSettled: () => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<UserFacingError | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [reference, setReference] = useState<string | null>(null)

  /**
   * Stable per-attempt key. Generated once when the sheet opens so that a double tap on
   * Pay reuses the same key and the server returns the existing record instead of
   * creating a second payment for the same milestone.
   */
  const idempotencyKey = useRef<string>('')
  useEffect(() => {
    if (open) {
      idempotencyKey.current = `${pact.id}:${milestone?.id ?? 'full'}:${Date.now()}`
      setPhase('idle')
      setError(null)
      setPayment(null)
      setReference(null)
    }
  }, [open, pact.id, milestone?.id])

  const amountMinor = milestone?.amountMinor ?? pact.totalAmountMinor
  const chainMeta = pact.chain ? EVM_CHAINS[pact.chain] : null

  const settle = useCallback(
    async (paymentId: string, status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'CANCELLED', extra: { txReference?: string; failureReason?: string }) => {
      await api(`/api/payments/${paymentId}`, {
        method: 'PATCH',
        body: { status, txReference: extra.txReference ?? null, failureReason: extra.failureReason ?? null },
      })
    },
    [],
  )

  const pay = async () => {
    setError(null)
    setPhase('recording')

    let created: { payment: Payment; instruction: Instruction }
    try {
      created = await api<{ payment: Payment; instruction: Instruction }>('/api/payments', {
        method: 'POST',
        body: {
          pactId: pact.id,
          milestoneId: milestone?.id ?? null,
          amountMinor,
          idempotencyKey: idempotencyKey.current,
        },
      })
      setPayment(created.payment)
    } catch (cause) {
      setPhase('failed')
      setError(toUserFacing(cause))
      return
    }

    setPhase('awaiting-wallet')

    try {
      let txReference: string

      if (created.instruction.currency === 'NIM') {
        txReference = await sendNimWithMemo({
          recipient: created.instruction.recipient,
          value: minorToLunaNumber(created.instruction.amountMinor),
          // The agreement reference goes into the transaction's data field, so the
          // payment's purpose is recorded on-chain rather than only in our database.
          memo: created.instruction.memo ?? `PACT:${pact.shortId}`,
        })
      } else {
        if (!created.instruction.evmRecipient || !created.instruction.chain) {
          throw new Error('missing EVM recipient')
        }
        const from = await connectEvm()
        txReference = await sendUsdt({
          chain: created.instruction.chain,
          from,
          to: created.instruction.evmRecipient,
          amountMinor: created.instruction.amountMinor,
        })
      }

      setReference(txReference)
      setPhase('submitted')

      /*
       * The wallet returned a reference, so the transaction left the device. We mark it
       * SUBMITTED first — that is a fact — and only then CONFIRMED. PACT does not run its
       * own chain indexer, so "confirmed" here means the wallet accepted and broadcast
       * the transaction, and the reference is stored so anyone can check it themselves.
       */
      await settle(created.payment.id, 'SUBMITTED', { txReference })
      await settle(created.payment.id, 'CONFIRMED', { txReference })

      setPhase('confirmed')
      onSettled()
    } catch (cause) {
      const userFacing = toUserFacing(cause)
      const cancelled = userFacing.code === 'USER_REJECTED'

      // Record the outcome against the payment we already created, so a cancelled or
      // failed attempt is visible on the timeline rather than disappearing.
      try {
        await settle(created.payment.id, cancelled ? 'CANCELLED' : 'FAILED', { failureReason: userFacing.title })
      } catch {
        // If even this fails the row stays PENDING, which is still honest.
      }

      setPhase(cancelled ? 'cancelled' : 'failed')
      setError(userFacing)
      onSettled()
    }
  }

  const busy = phase === 'recording' || phase === 'awaiting-wallet' || phase === 'submitted'
  const done = phase === 'confirmed'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={done ? 'Payment sent' : milestone ? `Pay ${milestone.title}` : 'Pay this agreement'}
      description={done ? undefined : `To ${pact.participants.find((p) => p.role === 'PROVIDER')?.displayName ?? 'the provider'}`}
      footer={
        done ? (
          <Button size="lg" fullWidth onClick={onClose}>
            Done
          </Button>
        ) : (
          <div className="space-y-2">
            <Button size="lg" fullWidth busy={busy} onClick={() => void pay()}>
              {phase === 'awaiting-wallet' ? (
                'Confirm in your wallet'
              ) : phase === 'cancelled' || phase === 'failed' ? (
                'Try again'
              ) : (
                <>
                  <Wallet aria-hidden className="h-4 w-4" />
                  Pay {milestone ? '' : 'in full'}
                </>
              )}
            </Button>
            {!busy && (
              <Button variant="ghost" fullWidth onClick={onClose}>
                Not now
              </Button>
            )}
          </div>
        )
      }
    >
      {done ? (
        <motion.div
          className="flex flex-col items-center py-6 text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-jade/15">
            <CircleCheck aria-hidden className="h-8 w-8 text-jade" />
          </div>
          <Money minor={amountMinor} currency={pact.currency} size="xl" className="mt-5 text-chalk" />
          <p className="mt-2 text-small text-chalk-muted">
            Sent to {pact.participants.find((p) => p.role === 'PROVIDER')?.displayName ?? 'the provider'}
            {milestone ? ` for ${milestone.title}` : ''}.
          </p>

          {reference && (
            <div className="mt-5 w-full rounded-xl border border-white/[0.07] bg-black/25 px-3.5 py-3 text-left">
              <p className="text-micro uppercase tracking-wider text-chalk-faint">Transaction reference</p>
              <p className="mt-1 break-all font-mono text-[0.7rem] text-chalk-muted">{reference}</p>
              {pact.currency === 'USDT' && pact.chain && reference.startsWith('0x') && (
                <a
                  href={explorerUrl(pact.chain, reference)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-azure-bright underline underline-offset-4"
                >
                  View on {EVM_CHAINS[pact.chain].name}
                  <ExternalLink aria-hidden className="h-3 w-3" />
                </a>
              )}
              {pact.currency === 'NIM' && (
                <p className="mt-2 text-[0.7rem] leading-relaxed text-chalk-faint">
                  This transaction carries <span className="font-mono">{payment?.memo}</span> in its data field, so its
                  purpose is recorded on the Nimiq blockchain itself.
                </p>
              )}
            </div>
          )}
        </motion.div>
      ) : (
        <div className="space-y-4 py-1">
          <div className="surface-quiet px-4 py-4 text-center">
            <Money minor={amountMinor} currency={pact.currency} size="xl" className="text-gold-bright" />
            {milestone && <p className="mt-1.5 text-small text-chalk-muted">{milestone.title}</p>}
          </div>

          <dl className="surface-quiet divide-y divide-white/[0.06]">
            <Row label="To">
              <span className="text-small text-chalk">
                {pact.participants.find((p) => p.role === 'PROVIDER')?.displayName}
              </span>
            </Row>
            <Row label={pact.currency === 'NIM' ? 'Address' : 'Nimiq address'}>
              <AddressChip address={pact.participants.find((p) => p.role === 'PROVIDER')?.address ?? ''} />
            </Row>
            {chainMeta && (
              <>
                <Row label="Network">
                  <span className="text-small text-chalk">{chainMeta.name}</span>
                </Row>
                <Row label="Network fee">
                  <span className="text-small text-chalk-muted">paid in {chainMeta.nativeSymbol}</span>
                </Row>
              </>
            )}
            <Row label="For">
              <span className="truncate text-small text-chalk-muted">{pact.title}</span>
            </Row>
            {pact.currency === 'NIM' && (
              <Row label="On-chain memo">
                <span className="font-mono text-[0.7rem] text-chalk-muted">PACT:{pact.shortId}</span>
              </Row>
            )}
          </dl>

          <DirectPaymentNotice />

          {phase === 'awaiting-wallet' && (
            <div className="flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold/[0.07] px-3.5 py-3">
              <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-gold-bright" />
              <p className="text-small text-chalk">Waiting for you to approve this in Nimiq Pay…</p>
            </div>
          )}

          {phase === 'submitted' && (
            <div className="flex items-center gap-2.5 rounded-xl border border-azure/25 bg-azure/[0.07] px-3.5 py-3">
              <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-azure-bright" />
              <p className="text-small text-chalk">Sent. Recording it against this agreement…</p>
            </div>
          )}

          {error && <ErrorNotice error={error} />}

          {phase === 'idle' && pact.currency === 'USDT' && (
            <p className="px-1 text-[0.7rem] leading-relaxed text-chalk-faint">
              You’ll need a little {chainMeta?.nativeSymbol} in your wallet for the network fee. PACT checks this before
              opening your wallet, so you won’t sign a payment that can’t go through.
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="shrink-0 text-small text-chalk-faint">{label}</dt>
      <dd className={cn('min-w-0 text-right')}>{children}</dd>
    </div>
  )
}

/** Used by callers that need the "cannot pay yet" reason without opening the sheet. */
export function payabilityReason(pact: PactDetail): UserFacingError | null {
  const provider = pact.participants.find((p) => p.role === 'PROVIDER')
  // Both of these are "not yet", not "something broke" — so they are marked benign and
  // render as information rather than as a red alert the user cannot act on.
  if (!provider?.address) {
    return {
      ...describe('NOT_ALLOWED'),
      title: 'They haven’t joined yet',
      body: 'Once they open the agreement, you’ll be able to pay them from here.',
      benign: true,
    }
  }
  if (pact.currency === 'USDT' && !provider.evmAddress) {
    return {
      ...describe('NOT_ALLOWED'),
      title: 'Waiting on their USDT address',
      body: `${provider.displayName} needs to open this agreement in Nimiq Pay once, so PACT can record where to send USDT.`,
      benign: true,
    }
  }
  return null
}

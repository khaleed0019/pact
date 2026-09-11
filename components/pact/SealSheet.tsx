'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, PenLine, ShieldCheck } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, Fingerprint, Money } from '@/components/ui/Bits'
import { PactSeal } from '@/components/seal/PactSeal'
import { api, toUserFacing } from '@/lib/client/api'
import { signMessage } from '@/lib/nimiq/provider'
import { formatLongDate } from '@/lib/format'
import { roleLabel, usesPayment } from '@/lib/pact/categories'
import type { PactDetail } from '@/lib/pact/types'
import type { UserFacingError } from '@/lib/errors'

/**
 * Signing a pact.
 *
 * This is the most consequential tap in the product, so the sheet is built around one
 * idea: **you must be able to see exactly what you are committing to, immediately above
 * the button that commits you.** The terms are restated in full here rather than being
 * left behind on the page, and the fingerprint is shown so it can be compared against
 * the other party's screen.
 *
 * The message text itself comes from the server, and the wallet displays that same text
 * in its own native dialog. The user therefore confirms the same words twice, in two
 * different trust contexts — ours and the wallet's.
 */

type Phase = 'loading' | 'ready' | 'signing' | 'done'

export function SealSheet({
  open,
  onClose,
  pact,
  onSealed,
}: {
  open: boolean
  onClose: () => void
  pact: PactDetail
  onSealed: () => void
}) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<UserFacingError | null>(null)
  const [bothSigned, setBothSigned] = useState(false)

  useEffect(() => {
    if (!open) return
    setPhase('loading')
    setError(null)
    setBothSigned(false)

    // Fetch the exact text to sign. The client never composes it — that guarantees the
    // signature verifies against what the server will reconstruct.
    api<{ message: string; alreadySealed: boolean }>(`/api/pacts/${pact.id}/seal`)
      .then((result) => {
        setMessage(result.message)
        setPhase(result.alreadySealed ? 'done' : 'ready')
      })
      .catch((cause) => {
        setError(toUserFacing(cause))
        setPhase('ready')
      })
  }, [open, pact.id])

  const sign = async () => {
    setPhase('signing')
    setError(null)
    try {
      const signed = await signMessage(message)
      const result = await api<{ sealed: boolean }>(`/api/pacts/${pact.id}/seal`, {
        method: 'POST',
        body: { publicKey: signed.publicKey, signature: signed.signature },
      })
      setBothSigned(result.sealed)
      setPhase('done')
      onSealed()
    } catch (cause) {
      setError(toUserFacing(cause))
      setPhase('ready')
    }
  }

  const client = pact.participants.find((p) => p.role === 'CLIENT')
  const provider = pact.participants.find((p) => p.role === 'PROVIDER')

  if (phase === 'done') {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={bothSigned ? 'Sealed' : 'You’ve signed'}
        footer={
          <Button size="lg" fullWidth onClick={onClose}>
            Done
          </Button>
        }
      >
        <motion.div
          className="flex flex-col items-center py-6 text-center"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* The burst only fires when the agreement actually locks. One side signing is
              progress; both signing is the event, and only the event gets celebrated. */}
          <div className={bothSigned ? 'seal-burst' : undefined}>
            <PactSeal status={bothSigned ? 'ACTIVE' : 'PENDING'} digest={pact.termsDigest} size="lg" animate />
          </div>
          <h3 className="mt-6 text-title text-chalk">
            {bothSigned ? 'Both sides have signed.' : 'Your signature is recorded.'}
          </h3>
          <p className="mt-2 max-w-[32ch] text-balance text-small leading-relaxed text-chalk-muted">
            {bothSigned
              ? 'These terms are now locked. Neither of you can change them without the other signing again.'
              : `Waiting on ${(pact.participants.find((p) => p.sealSignature === null)?.displayName) ?? 'the other party'} to sign.`}
          </p>
          <Fingerprint digest={pact.termsDigest} className="mt-6" />
        </motion.div>
      </Sheet>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={phase !== 'signing'}
      title="Sign these terms"
      description="Read this carefully. Signing commits you to exactly what’s below."
      footer={
        <div className="space-y-2">
          <Button size="lg" fullWidth busy={phase === 'signing' || phase === 'loading'} onClick={() => void sign()}>
            {phase === 'signing' ? (
              'Confirm in your wallet'
            ) : (
              <>
                <PenLine aria-hidden className="h-4 w-4" />
                Sign with my wallet
              </>
            )}
          </Button>
          {phase !== 'signing' && (
            <Button variant="ghost" fullWidth onClick={onClose}>
              Not yet
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <dl className="surface-quiet divide-y divide-white/[0.06]">
          <Row label="Agreement">{pact.title}</Row>
          <Row label="Deliverable">{pact.deliverable}</Row>
          {usesPayment(pact.category) && (
            <Row label="Value">
              <Money minor={pact.totalAmountMinor} currency={pact.currency} className="text-chalk" />
            </Row>
          )}
          <Row label="Deadline">{pact.deadline ? formatLongDate(pact.deadline) : 'No deadline set'}</Row>
          {usesPayment(pact.category) && <Row label="Payment">{pact.paymentCondition}</Row>}
          <Row label={roleLabel(pact.category, 'CLIENT')}>{client?.displayName ?? '—'}</Row>
          <Row label={roleLabel(pact.category, 'PROVIDER')}>{provider?.displayName ?? '—'}</Row>
        </dl>

        {pact.milestones.length > 0 && (
          <ol className="surface-quiet divide-y divide-white/[0.06]">
            {pact.milestones.map((milestone) => (
              <li key={milestone.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="min-w-0 truncate text-small text-chalk-muted">{milestone.title}</span>
                <Money minor={milestone.amountMinor} currency={pact.currency} size="sm" className="shrink-0 text-chalk" />
              </li>
            ))}
          </ol>
        )}

        {pact.specialTerms.length > 0 && (
          <ul className="surface-quiet space-y-1.5 px-3.5 py-3">
            {pact.specialTerms.map((term, index) => (
              <li key={index} className="flex gap-2 text-small leading-relaxed text-chalk-muted">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-chalk-faint" />
                {term}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2.5 rounded-xl border border-gold/25 bg-gold/[0.06] px-3.5 py-3">
          <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold-bright" />
          <p className="text-small leading-relaxed text-chalk-muted">
            <span className="font-medium text-chalk">Your wallet signs a fingerprint of these exact terms.</span> If any
            term changes later, both signatures are cleared and you’ll be asked to sign again. This does not move any
            money.
          </p>
        </div>

        <Fingerprint digest={pact.termsDigest} />

        {phase === 'signing' && (
          <div className="flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold/[0.07] px-3.5 py-3">
            <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-gold-bright" />
            <p className="text-small text-chalk">Nimiq Pay will show you the same text. Approve it there.</p>
          </div>
        )}

        {error && <ErrorNotice error={error} />}
      </div>
    </Sheet>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
      <dt className="shrink-0 pt-px text-small text-chalk-faint">{label}</dt>
      <dd className="min-w-0 flex-1 text-right text-small leading-relaxed text-chalk">{children}</dd>
    </div>
  )
}

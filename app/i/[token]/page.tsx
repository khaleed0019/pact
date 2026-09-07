'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, PenLine } from 'lucide-react'
import { useSession } from '@/lib/client/session'
import { api, toUserFacing } from '@/lib/client/api'
import { formatLongDate } from '@/lib/format'
import { PactSeal } from '@/components/seal/PactSeal'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { ErrorNotice, Fingerprint, Skeleton, Tag } from '@/components/ui/Bits'
import type { Currency, EvmChainKey, PactStatus } from '@/lib/pact/types'
import type { UserFacingError } from '@/lib/errors'

/**
 * The invitation landing page — where PACT meets a person who has never used it.
 *
 * The single most important decision here: **you see the agreement before you connect
 * anything.** No wallet prompt, no sign-in wall, no "connect to continue". Someone
 * arriving from a WhatsApp link gets the terms, the amount, the deadline and who sent it,
 * and only then decides whether to sign in.
 *
 * Asking for a signature first would be indistinguishable from every phishing flow these
 * users have been taught to close.
 */

interface Preview {
  id: string
  shortId: string
  title: string
  deliverable: string
  amountLabel: string
  currency: Currency
  chain: EvmChainKey | null
  deadline: string | null
  paymentCondition: string
  specialTerms: string[]
  termsDigest: string
  status: PactStatus
  milestones: Array<{ title: string; amountLabel: string; dueDate: string | null }>
  invitedBy: string
  yourRole: 'CLIENT' | 'PROVIDER'
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const { me, loading: sessionLoading, signInWithWallet, connecting, environment } = useSession()

  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<UserFacingError | null>(null)
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    api<{ preview: Preview }>(`/api/invites/${token}`)
      .then((result) => setPreview(result.preview))
      .catch((cause) => setError(toUserFacing(cause)))
      .finally(() => setLoading(false))
  }, [token])

  const join = useCallback(async () => {
    if (!preview) return
    setJoining(true)
    setError(null)
    try {
      await api(`/api/pacts/${preview.id}/join`, {
        method: 'POST',
        body: { displayName: displayName.trim() || 'Me', token },
      })
      router.push(`/p/${preview.id}`)
    } catch (cause) {
      setError(toUserFacing(cause))
      setJoining(false)
    }
  }, [preview, displayName, token, router])

  if (loading || sessionLoading) {
    return (
      <main className="safe-top mx-auto w-full max-w-[34rem] space-y-5 px-5 py-8">
        <Skeleton className="mx-auto h-24 w-24 rounded-full" />
        <Skeleton className="mx-auto h-7 w-56" />
        <Skeleton className="h-40" />
      </main>
    )
  }

  if (!preview) {
    return (
      <main className="safe-top mx-auto flex min-h-[var(--app-height)] w-full max-w-[34rem] flex-col justify-center px-5">
        {error && <ErrorNotice error={error} />}
        <Button variant="secondary" className="mt-5" fullWidth onClick={() => router.push('/')}>
          Go to PACT
        </Button>
      </main>
    )
  }

  const signedIn = me?.signedIn === true

  return (
    <main className="safe-top mx-auto w-full max-w-[34rem] px-5 pb-32">
      <motion.section
        className="flex flex-col items-center py-8 text-center"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <PactSeal status={preview.status} digest={preview.termsDigest} size="lg" animate />
        <p className="mt-6 text-small text-chalk-muted">{preview.invitedBy} sent you an agreement</p>
        <h1 className="mt-1.5 text-balance text-display text-chalk">{preview.title}</h1>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Tag tone="gold">You’re the {preview.yourRole === 'CLIENT' ? 'client' : 'provider'}</Tag>
          <Tag tone="neutral">{preview.yourRole === 'CLIENT' ? 'You pay' : 'You deliver'}</Tag>
        </div>
      </motion.section>

      <dl className="surface divide-y divide-white/[0.06]">
        <Row label="Deliverable">{preview.deliverable}</Row>
        <Row label="Value">
          <span className="font-semibold text-gold-bright">{preview.amountLabel}</span>
        </Row>
        <Row label="Deadline">{preview.deadline ? formatLongDate(preview.deadline) : 'No deadline set'}</Row>
        <Row label="Payment">{preview.paymentCondition}</Row>
      </dl>

      {preview.milestones.length > 0 && (
        <ol className="surface mt-3 divide-y divide-white/[0.06]">
          {preview.milestones.map((milestone, index) => (
            <li key={index} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-small text-chalk">{milestone.title}</p>
                {milestone.dueDate && <p className="text-[0.7rem] text-chalk-faint">by {formatLongDate(milestone.dueDate)}</p>}
              </div>
              <span className="shrink-0 text-small font-medium text-chalk">{milestone.amountLabel}</span>
            </li>
          ))}
        </ol>
      )}

      {preview.specialTerms.length > 0 && (
        <ul className="surface mt-3 space-y-1.5 px-4 py-3">
          {preview.specialTerms.map((term, index) => (
            <li key={index} className="flex gap-2 text-small leading-relaxed text-chalk-muted">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-chalk-faint" />
              {term}
            </li>
          ))}
        </ul>
      )}

      <Fingerprint digest={preview.termsDigest} className="mt-3" />

      {signedIn ? (
        <div className="mt-6 space-y-4">
          <Field label="What should they call you?">
            {({ inputId }) => (
              <TextInput
                id={inputId}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name"
                maxLength={80}
              />
            )}
          </Field>
          {error && <ErrorNotice error={error} />}
        </div>
      ) : (
        <p className="mt-6 px-1 text-center text-small leading-relaxed text-chalk-muted">
          {environment === 'nimiq-pay'
            ? 'Sign in with your Nimiq wallet to join. You’ll get to read everything again before you sign anything.'
            : 'Open this link inside Nimiq Pay to join and sign. Nothing is committed until you sign.'}
        </p>
      )}

      {error && !signedIn && <ErrorNotice error={error} className="mt-4" />}

      <div className="safe-bottom fixed inset-x-0 bottom-0 mx-auto max-w-[34rem] bg-gradient-to-t from-ink-900 via-ink-900/95 to-transparent px-5 pt-8">
        {signedIn ? (
          <Button size="lg" fullWidth busy={joining} onClick={() => void join()}>
            <PenLine aria-hidden className="h-4 w-4" />
            Open and review
          </Button>
        ) : (
          <Button size="lg" fullWidth busy={connecting} onClick={() => void signInWithWallet()}>
            Continue with Nimiq Pay
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Button>
        )}
      </div>
    </main>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 pt-px text-small text-chalk-faint">{label}</dt>
      <dd className="min-w-0 flex-1 text-right text-small leading-relaxed text-chalk">{children}</dd>
    </div>
  )
}

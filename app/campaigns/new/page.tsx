'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { api, toUserFacing } from '@/lib/client/api'
import { useSession } from '@/lib/client/session'
import { AmountError, toMinor } from '@/lib/pact/money'
import { EVM_CHAINS } from '@/lib/pact/types'
import type { Currency, EvmChainKey } from '@/lib/pact/types'
import type { UserFacingError } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { Field, Segmented, TextArea, TextInput } from '@/components/ui/Field'
import { ErrorNotice } from '@/components/ui/Bits'

/**
 * Post work.
 *
 * Says plainly what posting does and does not do: it publishes an offer. It does not set
 * money aside — the brand pays each person directly after approving their work — and the
 * form never asks for a deposit because there is nowhere for one to go.
 */
export default function NewCampaignPage() {
  const router = useRouter()
  const { me } = useSession()

  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [requirements, setRequirements] = useState<string[]>([''])
  const [currency, setCurrency] = useState<Currency>('NIM')
  const [chain, setChain] = useState<EvmChainKey>('polygon')
  const [reward, setReward] = useState('')
  const [slots, setSlots] = useState('5')
  const [deadline, setDeadline] = useState('')
  const [name, setName] = useState(me?.displayName ?? '')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UserFacingError | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const submit = async () => {
    setFieldError(null)
    setError(null)

    let rewardMinor: string
    try {
      rewardMinor = toMinor(reward, currency)
    } catch (cause) {
      setFieldError(cause instanceof AmountError ? cause.message : 'Enter a valid reward.')
      return
    }
    const count = Number(slots)
    if (!Number.isInteger(count) || count < 1 || count > 500) {
      setFieldError('Spots must be a whole number from 1 to 500.')
      return
    }

    setBusy(true)
    try {
      const result = await api<{ campaign: { id: string } }>('/api/campaigns', {
        method: 'POST',
        body: {
          ownerName: (name || me?.displayName || '').trim(),
          title: title.trim(),
          brief: brief.trim(),
          requirements: requirements.map((r) => r.trim()).filter(Boolean),
          currency,
          chain: currency === 'USDT' ? chain : null,
          rewardMinor,
          slots: count,
          deadline: deadline || null,
        },
      })
      router.push(`/campaigns/${result.campaign.id}`)
    } catch (cause) {
      setError(toUserFacing(cause))
      setBusy(false)
    }
  }

  const ready = title.trim() && brief.trim() && reward.trim() && (name || me?.displayName)

  return (
    <main className="safe-top mx-auto w-full max-w-[34rem] px-5 pb-16">
      <header className="flex items-center gap-2 py-3">
        <Link
          href="/campaigns"
          aria-label="Back"
          className="-ml-2 flex h-tap w-tap items-center justify-center rounded-full text-chalk-muted active:bg-white/10"
        >
          <ArrowLeft aria-hidden className="h-5 w-5" />
        </Link>
        <h1 className="text-heading text-chalk">Post work</h1>
      </header>

      {!me?.signedIn ? (
        <p className="text-small text-chalk-muted">Sign in with your Nimiq wallet to post work.</p>
      ) : me.role !== 'BRAND' ? (
        <div className="surface px-4 py-4">
          <p className="text-heading text-chalk">Posting work is for brands</p>
          <p className="mt-1 text-small leading-relaxed text-chalk-muted">
            You’re using PACT as a contributor. Switch to Brand in your profile to post a campaign — agreements you
            already have stay exactly as they are.
          </p>
          <Link href="/trust" className="mt-3 inline-block text-small font-medium text-gold-bright underline underline-offset-4">
            Go to your profile
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="What’s the work?">
            {({ inputId }) => (
              <TextInput
                id={inputId}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Post a thread about our launch"
                maxLength={140}
              />
            )}
          </Field>

          <Field label="The brief" hint="What you’re after, in a few sentences.">
            {({ inputId }) => (
              <TextArea id={inputId} rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={1000} />
            )}
          </Field>

          <Field label="Requirements" hint="What the work has to include for you to approve it.">
            {() => (
              <div className="space-y-2">
                {requirements.map((value, index) => (
                  <div key={index} className="flex gap-2">
                    <TextInput
                      value={value}
                      aria-label={`Requirement ${index + 1}`}
                      maxLength={120}
                      onChange={(e) => setRequirements((r) => r.map((x, i) => (i === index ? e.target.value : x)))}
                    />
                    {requirements.length > 1 && (
                      <button
                        type="button"
                        aria-label="Remove requirement"
                        onClick={() => setRequirements((r) => r.filter((_, i) => i !== index))}
                        className="flex h-tap w-tap shrink-0 items-center justify-center rounded-xl text-chalk-faint active:bg-white/10"
                      >
                        <X aria-hidden className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {requirements.length < 8 && (
                  <button
                    type="button"
                    onClick={() => setRequirements((r) => [...r, ''])}
                    className="inline-flex items-center gap-1.5 text-small font-medium text-gold-bright"
                  >
                    <Plus aria-hidden className="h-3.5 w-3.5" />
                    Add a requirement
                  </button>
                )}
              </div>
            )}
          </Field>

          <Field label="Paid in">
            {() => (
              <Segmented
                label="Currency"
                value={currency}
                onChange={setCurrency}
                options={[
                  { value: 'NIM', label: 'NIM' },
                  { value: 'USDT', label: 'USDT' },
                ]}
              />
            )}
          </Field>

          {currency === 'USDT' && (
            <Field label="Network">
              {() => (
                <Segmented
                  label="Network"
                  value={chain}
                  onChange={setChain}
                  options={(Object.keys(EVM_CHAINS) as EvmChainKey[]).map((key) => ({ value: key, label: EVM_CHAINS[key].name }))}
                />
              )}
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Reward per person (${currency})`} error={fieldError}>
              {({ inputId }) => (
                <TextInput
                  id={inputId}
                  inputMode="decimal"
                  value={reward}
                  onChange={(e) => setReward(e.target.value)}
                  error={Boolean(fieldError)}
                  placeholder="0"
                />
              )}
            </Field>
            <Field label="Spots">
              {({ inputId }) => (
                <TextInput id={inputId} inputMode="numeric" value={slots} onChange={(e) => setSlots(e.target.value)} />
              )}
            </Field>
          </div>

          <Field label="Deadline" hint="Optional. After this date nobody new can take it up.">
            {({ inputId }) => <TextInput id={inputId} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />}
          </Field>

          {!me.displayName && (
            <Field label="Your name or brand">
              {({ inputId }) => <TextInput id={inputId} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
            </Field>
          )}

          <p className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3 text-[0.75rem] leading-relaxed text-chalk-muted">
            Posting publishes an offer. It doesn’t set any money aside — you pay each person directly from your wallet
            after you’ve approved their work, and PACT shows a payment as paid only once it’s confirmed on the network.
          </p>

          {error && <ErrorNotice error={error} />}

          <Button size="lg" fullWidth busy={busy} disabled={!ready} onClick={() => void submit()}>
            Post work
          </Button>
        </div>
      )}
    </main>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, ChevronRight, Globe } from 'lucide-react'
import { api, toUserFacing } from '@/lib/client/api'
import { formatWithCurrency } from '@/lib/pact/money'
import { relativeTime } from '@/lib/format'
import { categoryMeta, usesPayment } from '@/lib/pact/categories'
import { PactSeal } from '@/components/seal/PactSeal'
import { EmptyState, ErrorNotice, Skeleton, StatusPill } from '@/components/ui/Bits'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import type { VerificationRecord } from '@/lib/pact/types'
import type { UserFacingError } from '@/lib/errors'

/**
 * Publicly listed agreements.
 *
 * Deliberately browse-only, and the copy says so rather than implying otherwise. PACT has
 * no concept of an agreement a stranger can join: the invitation token *is* the access
 * control, and every pact has exactly two sides. A feed with a "Join" button on it would
 * be a button that cannot work.
 *
 * What it is instead is the public face of the proof concept — the completed records
 * people were willing to put their name to. That is worth showing, and it is honest about
 * being a gallery rather than a marketplace.
 */
export default function DiscoverPage() {
  const router = useRouter()
  const [lookup, setLookup] = useState('')
  const [records, setRecords] = useState<VerificationRecord[] | null>(null)
  const [error, setError] = useState<UserFacingError | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await api<{ records: VerificationRecord[] }>('/api/discover')
      setRecords(result.records)
      setError(null)
    } catch (cause) {
      setError(toUserFacing(cause))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="safe-top mx-auto w-full max-w-[34rem] px-5 pb-16">
      <header className="flex items-center gap-2 py-3">
        <Link
          href="/"
          aria-label="Back"
          className="-ml-2 flex h-tap w-tap items-center justify-center rounded-full text-chalk-muted active:bg-white/10"
        >
          <ArrowLeft aria-hidden className="h-5 w-5" />
        </Link>
        <h1 className="text-heading text-chalk">Public records</h1>
      </header>

      <p className="mb-4 text-small leading-relaxed text-chalk-muted">
        Agreements whose parties chose to publish them. You can check any of these — the terms, the fingerprint, and
        both signatures — without being part of it.
      </p>

      {/* Every pact prints its reference on screen and in the on-chain memo, so being
          handed one and having nowhere to type it was a real dead end. */}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const reference = lookup.trim().toUpperCase()
          if (reference.length > 0) router.push(`/verify/${reference}`)
        }}
        className="mb-6 flex gap-2"
      >
        <TextInput
          value={lookup}
          onChange={(event) => setLookup(event.target.value)}
          placeholder="Check a reference, e.g. 2UTQT9FA"
          aria-label="Pact reference"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          className="tabular"
        />
        <Button type="submit" variant="secondary" disabled={lookup.trim().length === 0}>
          Check
        </Button>
      </form>

      {error && <ErrorNotice error={error} className="mb-5" onRetry={() => void load()} />}

      {records === null && !error && (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {records?.length === 0 && (
        <div className="surface">
          <EmptyState
            title="Nothing published yet"
            body="When someone publishes an agreement, it shows up here. You can publish your own from its page, once you and the other side have signed it."
          />
        </div>
      )}

      <ul className="space-y-2.5">
        {records?.map((record, index) => (
          <motion.li
            key={record.shortId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.3), ease: [0.16, 1, 0.3, 1] }}
          >
            <Link
              href={`/verify/${record.shortId}`}
              className="surface flex items-center gap-3 px-4 py-3.5 active:bg-white/[0.05]"
            >
              <PactSeal status={record.status} digest={record.termsDigest} size="sm" className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold text-chalk">{record.title}</p>
                <p className="mt-0.5 truncate text-[0.7rem] text-chalk-faint">
                  {categoryMeta(record.category).label} · {relativeTime(record.updatedAt)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusPill status={record.status} />
                  {usesPayment(record.category) && (
                    <span className="tabular text-small font-semibold text-chalk">
                      {formatWithCurrency(record.totalAmountMinor, record.currency)}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-chalk-faint" />
            </Link>
          </motion.li>
        ))}
      </ul>

      {records && records.length > 0 && (
        <p className="mt-6 flex items-start gap-2 px-1 text-[0.7rem] leading-relaxed text-chalk-faint">
          <Globe aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            These are records, not listings — every PACT is between two specific people, so there is nothing here to
            join. Publishing is always the parties’ own choice and either of them can undo it.
          </span>
        </p>
      )}
    </main>
  )
}

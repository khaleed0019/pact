'use client'

import { useEffect, useRef, useState } from 'react'
import { AtSign, Loader2, Plus, Wallet, X } from 'lucide-react'
import { api } from '@/lib/client/api'
import { formatAddress, isValidAddress, shortenAddress } from '@/lib/nimiq/address'
import { normalizeHandle } from '@/lib/pact/handles'
import type { PublicProfile } from '@/lib/pact/handles'
import { cn } from '@/lib/cn'

/** Someone the brand has chosen to invite. The address is what the invitation binds to. */
export type Invitee =
  | { kind: 'handle'; handle: string; displayName: string; address: string }
  | { kind: 'address'; address: string }

export function toTarget(invitee: Invitee): { handle: string } | { address: string } {
  return invitee.kind === 'handle' ? { handle: invitee.handle } : { address: invitee.address }
}

/**
 * Pick people to invite: search by @handle, or paste an exact Nimiq address.
 *
 * Search results show the address beside the handle, because the handle is only a way to
 * find someone — the invitation goes to that wallet. A pasted address is checked for a
 * valid Nimiq checksum before it can be added; the server checks both again.
 */
export function InvitePicker({
  chosen,
  onAdd,
  onRemove,
  busy = false,
}: {
  chosen: Invitee[]
  onAdd: (invitee: Invitee) => void
  onRemove?: (invitee: Invitee) => void
  busy?: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PublicProfile[]>([])
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const looksLikeAddress = /^nq/i.test(query.trim())
  const addressOk = looksLikeAddress && isValidAddress(query.trim())

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    setMessage(null)
    const q = normalizeHandle(query)
    if (looksLikeAddress || !/^[a-z0-9_]{1,20}$/.test(q)) {
      setResults([])
      return
    }
    timer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await api<{ profiles: PublicProfile[] }>(`/api/profiles?q=${encodeURIComponent(q)}`)
        setResults(data.profiles)
        if (data.profiles.length === 0) setMessage(`No one on PACT has a handle starting with @${q}.`)
      } catch {
        setMessage('Couldn’t search just now. You can paste their Nimiq address instead.')
      }
      setSearching(false)
    }, 250)
  }, [query, looksLikeAddress])

  const already = (address: string) => chosen.some((c) => c.address.replace(/\s/g, '') === address.replace(/\s/g, ''))

  const add = (invitee: Invitee) => {
    if (already(invitee.address)) {
      setMessage('Already on the list.')
      return
    }
    onAdd(invitee)
    setQuery('')
    setResults([])
  }

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-chalk-faint">
          {looksLikeAddress ? <Wallet className="h-4 w-4" /> : <AtSign className="h-4 w-4" />}
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="@handle or NQ… address"
          aria-label="Invite by handle or Nimiq address"
          autoCapitalize="none"
          spellCheck={false}
          className="focus-ring min-h-tap w-full rounded-xl border border-white/[0.09] bg-black/25 py-3 pl-10 pr-10 text-body text-chalk placeholder:text-chalk-faint"
        />
        {searching && <Loader2 aria-hidden className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-chalk-faint" />}
      </div>

      {looksLikeAddress && (
        <button
          type="button"
          disabled={!addressOk || busy}
          onClick={() => add({ kind: 'address', address: formatAddress(query.trim()) })}
          className="focus-ring flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-ink-850 px-3.5 py-2.5 text-left disabled:opacity-50"
        >
          <span className="min-w-0">
            <span className="block text-small text-chalk">{addressOk ? 'Invite this wallet' : 'Not a valid Nimiq address yet'}</span>
            <span className="block truncate font-mono text-[0.68rem] text-chalk-muted">{query.trim()}</span>
          </span>
          {addressOk && <Plus aria-hidden className="h-4 w-4 shrink-0 text-gold-bright" />}
        </button>
      )}

      {results.length > 0 && (
        <ul className="surface divide-y divide-white/[0.06] overflow-hidden" aria-label="Matching people">
          {results.map((p) => (
            <li key={p.address}>
              <button
                type="button"
                disabled={busy}
                onClick={() => p.handle && add({ kind: 'handle', handle: p.handle, displayName: p.displayName, address: p.address })}
                className="focus-ring flex w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-white/[0.04]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-small font-semibold text-gold-bright">
                  {(p.displayName || p.handle || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-semibold text-chalk">@{p.handle}</span>
                  <span className="block truncate text-[0.7rem] text-chalk-muted">
                    {p.displayName} · <span className="font-mono">{shortenAddress(p.address)}</span>
                  </span>
                </span>
                <Plus aria-hidden className="h-4 w-4 shrink-0 text-gold-bright" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && <p className="px-1 text-[0.7rem] text-chalk-muted">{message}</p>}

      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="People to invite">
          {chosen.map((c) => (
            <li
              key={c.address}
              className={cn('inline-flex items-center gap-1.5 rounded-pill border border-gold/30 bg-gold/10 py-1 pl-3 text-[0.75rem] text-chalk', onRemove ? 'pr-1' : 'pr-3')}
            >
              {c.kind === 'handle' ? `@${c.handle}` : <span className="font-mono">{shortenAddress(c.address)}</span>}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(c)}
                  aria-label={`Remove ${c.kind === 'handle' ? '@' + c.handle : 'this address'}`}
                  className="focus-ring flex h-6 w-6 items-center justify-center rounded-full text-chalk-muted active:bg-white/10"
                >
                  <X aria-hidden className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

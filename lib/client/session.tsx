'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, toUserFacing } from './api.ts'
import { connectWallet, detectEnvironment, detectLocale, signMessage } from '../nimiq/provider.ts'
import type { Notification, Pact, TrustMetrics } from '../pact/types.ts'
import type { UserFacingError } from '../errors.ts'

/**
 * App-wide session and dashboard state.
 *
 * One provider, one `/api/me` call. The Command Center, the header, the trust profile and
 * the notification badge all read from here rather than each firing their own request —
 * inside a mobile WebView on a slow connection, request count is the thing you feel.
 */

export interface MeResponse {
  signedIn: boolean
  address?: string
  displayName?: string
  demo?: boolean
  pacts?: Pact[]
  trust?: TrustMetrics
  notifications?: Notification[]
  capabilities: { aiModel: boolean; ephemeralStore: boolean }
}

interface SessionValue {
  loading: boolean
  me: MeResponse | null
  error: UserFacingError | null
  environment: 'nimiq-pay' | 'browser'
  locale: string
  /** True while a wallet dialog is open, so the UI can show what it is waiting for. */
  connecting: boolean
  refresh: () => Promise<void>
  signInWithWallet: () => Promise<void>
  signInAsDemo: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<UserFacingError | null>(null)
  const [environment, setEnvironment] = useState<'nimiq-pay' | 'browser'>('browser')
  const [locale, setLocale] = useState('en')

  useEffect(() => {
    // Providers are injected before the page script runs, so this is safe on mount.
    setEnvironment(detectEnvironment())
    setLocale(detectLocale())
  }, [])

  const refresh = useCallback(async () => {
    try {
      setMe(await api<MeResponse>('/api/me'))
      setError(null)
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Sign-In With Nimiq.
   *
   * Three steps, and the middle one is the only place the wallet is involved: ask the
   * server for a challenge, have the wallet sign the exact text the server sent back,
   * post the signature. The client never chooses what gets signed.
   */
  const signInWithWallet = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      await connectWallet() // surfaces "not in Nimiq Pay" before we bother the server
      const challenge = await api<{ nonce: string; message: string }>('/api/auth/nonce', { method: 'POST' })
      const signed = await signMessage(challenge.message)

      await api('/api/auth/verify', {
        method: 'POST',
        body: { publicKey: signed.publicKey, signature: signed.signature, nonce: challenge.nonce },
      })
      await refresh()
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setConnecting(false)
    }
  }, [refresh])

  const signInAsDemo = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      await api('/api/auth/demo', { method: 'POST' })
      await refresh()
    } catch (cause) {
      setError(toUserFacing(cause))
    } finally {
      setConnecting(false)
    }
  }, [refresh])

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } finally {
      // Clear locally regardless: a failed logout must still feel like a logout.
      setMe({ signedIn: false, capabilities: me?.capabilities ?? { aiModel: false, ephemeralStore: true } })
      await refresh()
    }
  }, [refresh, me?.capabilities])

  const value = useMemo<SessionValue>(
    () => ({ loading, me, error, environment, locale, connecting, refresh, signInWithWallet, signInAsDemo, signOut }),
    [loading, me, error, environment, locale, connecting, refresh, signInWithWallet, signInAsDemo, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside <SessionProvider>')
  return context
}

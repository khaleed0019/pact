'use client'

import { FlaskConical, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useSession } from '@/lib/client/session'

/**
 * Persistent app-level notices.
 *
 * Two things a user must never be confused about, so both live above every screen:
 *
 *  - **Demo data.** A demo agreement looks exactly like a real one by design, which is
 *    precisely why it needs a label that cannot be mistaken for part of the content.
 *    It is dismissible per session but reappears on reload — annoying on purpose.
 *  - **Ephemeral storage.** When PACT is running without a configured database, saying
 *    so up front is the honest thing; discovering it after creating a real agreement
 *    would not be.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const { me } = useSession()
  const [dismissed, setDismissed] = useState(false)

  const isDemo = me?.demo === true
  const isEphemeral = me?.capabilities.ephemeralStore === true

  const notice = isDemo
    ? {
        text: 'Demo data. These agreements are examples — no real payments or signatures.',
        tone: 'demo' as const,
      }
    : isEphemeral
      ? {
          text: 'Running without a database. Agreements you create last until the server restarts.',
          tone: 'storage' as const,
        }
      : null

  return (
    <>
      {notice && !dismissed && (
        <div
          role="status"
          className="safe-top sticky top-0 z-40 flex items-center gap-2.5 border-b border-gold/20 bg-gold/[0.09] px-4 py-2 backdrop-blur"
        >
          <FlaskConical aria-hidden className="h-3.5 w-3.5 shrink-0 text-gold-bright" />
          <p className="min-w-0 flex-1 text-[0.7rem] leading-snug text-chalk">{notice.text}</p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Hide this notice"
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-chalk-faint active:bg-white/10"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {children}
    </>
  )
}

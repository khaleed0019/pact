'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Briefcase, Check, Sparkles } from 'lucide-react'
import { useSession } from '@/lib/client/session'
import { toUserFacing } from '@/lib/client/api'
import { ROLE_META, type AppRole } from '@/lib/pact/roles'
import { Button } from '@/components/ui/Button'
import { AddressChip, ErrorNotice } from '@/components/ui/Bits'
import type { UserFacingError } from '@/lib/errors'
import { cn } from '@/lib/cn'

const ICON: Record<AppRole, typeof Briefcase> = { BRAND: Briefcase, CONTRIBUTOR: Sparkles }

/**
 * First run, after the wallet has proved who you are: what did you come here to do?
 *
 * Shown only when the server says this verified address has no role yet, so a returning
 * user is never asked twice. The choice is saved through `/api/me/role`, which writes it
 * against the session's address — the screen picks a role, it cannot pick whose.
 *
 * Both options are explained before anything is committed, and the role can be changed
 * later from the profile; the copy says so, so the choice does not feel permanent.
 *
 * `mode="switch"` reuses the same screen from the profile, pre-selected on the current
 * role, with a way back.
 */
export function RoleSelect({ mode = 'first-run', onDone }: { mode?: 'first-run' | 'switch'; onDone?: () => void }) {
  const { me, chooseRole } = useSession()
  const reduceMotion = useReducedMotion()
  const [selected, setSelected] = useState<AppRole | null>(me?.role ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UserFacingError | null>(null)

  const save = async () => {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      await chooseRole(selected)
      onDone?.()
    } catch (cause) {
      setError(toUserFacing(cause))
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-[var(--app-height)] overflow-hidden">
      {/* One still, soft glow — enough to give the glass something to refract, nothing moving. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-[-12%] h-[26rem] w-[26rem] -translate-x-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(233,178,19,0.22), transparent 65%)' }}
        />
        <div
          className="absolute bottom-[-10%] right-[-20%] h-[22rem] w-[22rem] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(5,130,202,0.2), transparent 65%)' }}
        />
      </div>

      <main className="safe-top relative mx-auto flex min-h-[var(--app-height)] w-full max-w-[34rem] flex-col px-5 pb-6">
        <div className="flex-1 pt-8">
          {me?.address && (
            <div className="flex justify-center">
              <span className="glass inline-flex items-center gap-2 rounded-pill px-3 py-1.5">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-jade" />
                <span className="text-[0.7rem] text-chalk-muted">Signed in as</span>
                <AddressChip address={me.address} />
              </span>
            </div>
          )}

          <h1 className="mt-7 text-balance text-center text-display text-chalk">
            {mode === 'switch' ? 'Switch how you use PACT' : 'How will you use PACT?'}
          </h1>
          <p className="mx-auto mt-2.5 max-w-[34ch] text-balance text-center text-body text-chalk-muted">
            This sets your dashboard and what you can do with campaigns. You can change it later in your profile.
          </p>

          <div role="radiogroup" aria-label="Choose your role" className="mt-8 space-y-3">
            {(['BRAND', 'CONTRIBUTOR'] as const).map((role, index) => {
              const meta = ROLE_META[role]
              const Icon = ICON[role]
              const active = selected === role
              return (
                <motion.button
                  key={role}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(role)}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.08 * index, ease: [0.16, 1, 0.3, 1] }}
                  whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                  className={cn(
                    'glass focus-ring relative w-full rounded-sheet px-4 py-4 text-left transition-[border-color,box-shadow] duration-200',
                    active && 'glass-selected',
                  )}
                >
                  <div className="flex items-start gap-3.5">
                    <span
                      className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors',
                        active ? 'border-gold/40 bg-gold/15 text-gold-bright' : 'border-white/10 bg-white/[0.04] text-chalk-muted',
                      )}
                    >
                      <Icon aria-hidden className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-heading text-chalk">I’m a {meta.label}</p>
                      <p className="mt-0.5 text-small text-chalk-muted">{meta.pitch}</p>
                      <ul className="mt-3 space-y-1.5">
                        {meta.does.map((line) => (
                          <li key={line} className="flex items-center gap-2 text-[0.75rem] text-chalk-muted">
                            <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-chalk-faint" />
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <span
                      aria-hidden
                      className={cn(
                        'mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200',
                        active ? 'border-gold bg-gold text-ink-950' : 'border-white/20',
                      )}
                    >
                      {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>

        <div className="safe-bottom space-y-3 pt-6">
          {error && <ErrorNotice error={error} onRetry={() => void save()} />}
          <Button size="lg" fullWidth busy={busy} disabled={!selected || (mode === 'switch' && selected === me?.role)} onClick={() => void save()}>
            {selected ? `Continue as ${ROLE_META[selected].label}` : 'Choose one to continue'}
            {selected && !busy && <ArrowRight aria-hidden className="h-4 w-4" />}
          </Button>
          {mode === 'switch' && (
            <Button variant="ghost" fullWidth onClick={onDone}>
              Keep {me?.role ? ROLE_META[me.role].label : 'current role'}
            </Button>
          )}
          <p className="px-2 text-center text-[0.7rem] leading-relaxed text-chalk-faint">
            Switching later never changes an agreement you’ve already made — who pays and who delivers is fixed in each
            agreement.
          </p>
        </div>
      </main>
    </div>
  )
}

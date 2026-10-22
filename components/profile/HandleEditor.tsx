'use client'

import { useEffect, useState } from 'react'
import { AtSign, Check, Plus, X } from 'lucide-react'
import { api, toUserFacing } from '@/lib/client/api'
import { HANDLE_PROBLEM_MESSAGE, handleProblem, normalizeHandle, type PublicProfile } from '@/lib/pact/handles'
import { CAMPAIGN_CATEGORIES, CATEGORY_LABEL, type CampaignCategory } from '@/lib/campaigns/model'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, SectionTitle } from '@/components/ui/Bits'
import type { UserFacingError } from '@/lib/errors'
import { cn } from '@/lib/cn'

/**
 * Your Pact handle, the kind of work you do, and where to see it.
 *
 * The handle lets a brand find and invite you. It is saved against the wallet you signed
 * in with — PACT shows that wallet next to it everywhere — so "@name" is a way to find a
 * wallet, not a claim about who someone is. Links are only http(s); the server checks.
 */
export function HandleEditor({ onSaved }: { onSaved: () => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [handle, setHandle] = useState('')
  const [categories, setCategories] = useState<CampaignCategory[]>([])
  const [links, setLinks] = useState<string[]>([])
  const [linkDraft, setLinkDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<UserFacingError | null>(null)

  useEffect(() => {
    api<{ profile: PublicProfile }>('/api/me/profile')
      .then(({ profile }) => {
        setProfile(profile)
        setHandle(profile.handle ?? '')
        setCategories(profile.categories as CampaignCategory[])
        setLinks(profile.links)
      })
      .catch((cause) => setError(toUserFacing(cause)))
  }, [])

  const normalized = normalizeHandle(handle)
  const problem = normalized ? handleProblem(normalized) : null
  const dirty =
    profile !== null &&
    (normalized !== (profile.handle ?? '') ||
      categories.join() !== profile.categories.join() ||
      links.join() !== profile.links.join())

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const result = await api<{ profile: PublicProfile }>('/api/me/profile', {
        method: 'PATCH',
        body: { handle: normalized || null, categories, links },
      })
      setProfile(result.profile)
      setSaved(true)
      onSaved()
    } catch (cause) {
      setError(toUserFacing(cause))
    }
    setBusy(false)
  }

  const addLink = () => {
    const value = linkDraft.trim()
    if (!/^https?:\/\/\S+$/i.test(value) || links.length >= 4) return
    setLinks((l) => [...l, value])
    setLinkDraft('')
  }

  return (
    <section className="mb-4">
      <SectionTitle>Your Pact handle</SectionTitle>
      <div className="surface space-y-4 px-4 py-4">
        <div>
          <label htmlFor="handle" className="text-small font-medium text-chalk">
            Handle
          </label>
          <div className="relative mt-1.5">
            <AtSign aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-chalk-faint" />
            <input
              id="handle"
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value)
                setSaved(false)
              }}
              placeholder="yourname"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={21}
              aria-invalid={problem ? true : undefined}
              aria-describedby="handle-hint"
              className="focus-ring min-h-tap w-full rounded-xl border border-white/[0.09] bg-black/25 py-3 pl-10 pr-3.5 text-body text-chalk placeholder:text-chalk-faint"
            />
          </div>
          <p id="handle-hint" className={cn('mt-1.5 text-[0.7rem] leading-relaxed', problem ? 'text-rose' : 'text-chalk-faint')}>
            {problem
              ? HANDLE_PROBLEM_MESSAGE[problem]
              : 'Brands can find and invite you by this. It’s tied to the wallet you signed in with.'}
          </p>
        </div>

        <div>
          <p className="text-small font-medium text-chalk">Work you do</p>
          <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Work you do">
            {CAMPAIGN_CATEGORIES.map((c) => {
              const on = categories.includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCategories((list) => (on ? list.filter((x) => x !== c) : [...list, c].slice(0, 5)))}
                  className={cn(
                    'focus-ring min-h-9 rounded-full border px-3.5 text-small',
                    on ? 'border-gold/45 bg-gold/10 text-chalk' : 'border-white/[0.08] text-chalk-muted',
                  )}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="text-small font-medium text-chalk">Portfolio and links</p>
          {links.length > 0 && (
            <ul className="mt-1.5 space-y-1.5">
              {links.map((l) => (
                <li key={l} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-small text-azure-bright">{l}</span>
                  <button
                    type="button"
                    onClick={() => setLinks((list) => list.filter((x) => x !== l))}
                    aria-label={`Remove ${l}`}
                    className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-chalk-faint"
                  >
                    <X aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {links.length < 4 && (
            <div className="mt-1.5 flex gap-2">
              <input
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                placeholder="https://"
                aria-label="Add a link"
                inputMode="url"
                className="focus-ring min-h-tap min-w-0 flex-1 rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-3 text-body text-chalk placeholder:text-chalk-faint"
              />
              <Button variant="secondary" onClick={addLink} disabled={!/^https?:\/\/\S+$/i.test(linkDraft.trim())} aria-label="Add link">
                <Plus aria-hidden className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {error && <ErrorNotice error={error} />}
        <Button fullWidth busy={busy} disabled={!dirty || !!problem} onClick={() => void save()}>
          {saved && !dirty ? (
            <>
              <Check aria-hidden className="h-4 w-4" />
              Saved
            </>
          ) : (
            'Save profile'
          )}
        </Button>
      </div>
    </section>
  )
}

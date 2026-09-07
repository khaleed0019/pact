'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { formatAmount, splitByPercent } from '@/lib/pact/money'
import { cn } from '@/lib/cn'
import type { Currency } from '@/lib/pact/types'
import type { DraftMilestone } from './types'

/**
 * Milestones.
 *
 * The editor works in **percentages**, and shows the resulting amount underneath. That
 * choice is what keeps the parts summing to the whole: percentages are normalised to 100
 * here, and the server derives the actual minor-unit amounts with the same
 * remainder-to-the-last-milestone rule. A user editing amounts directly would sooner or
 * later create a set of milestones that does not add up to the agreement they signed.
 */
export function MilestoneEditor({
  milestones,
  currency,
  totalMinor,
  onChange,
}: {
  milestones: DraftMilestone[]
  currency: Currency
  /** Null while the amount field is empty or invalid — the preview simply hides. */
  totalMinor: string | null
  onChange: (next: DraftMilestone[]) => void
}) {
  const total = milestones.reduce((sum, m) => sum + m.percent, 0)
  const balanced = Math.abs(total - 100) < 0.01
  const amounts = totalMinor && balanced ? splitByPercent(totalMinor, milestones.map((m) => m.percent)) : null

  const update = (index: number, patch: Partial<DraftMilestone>) => {
    onChange(milestones.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  const add = () => {
    // New milestones take an even share, so the total stays at 100 without the user
    // having to do arithmetic to add one.
    const count = milestones.length + 1
    const even = Math.floor((100 / count) * 100) / 100
    const next = [...milestones, { title: '', description: '', percent: even, dueDate: '' }].map((m, i) => ({
      ...m,
      percent: i === count - 1 ? Math.round((100 - even * (count - 1)) * 100) / 100 : even,
    }))
    onChange(next)
  }

  const remove = (index: number) => {
    const remaining = milestones.filter((_, i) => i !== index)
    if (remaining.length === 0) return onChange([])
    // Redistribute so removing one never silently leaves the split short.
    const even = Math.floor((100 / remaining.length) * 100) / 100
    onChange(
      remaining.map((m, i) => ({
        ...m,
        percent: i === remaining.length - 1 ? Math.round((100 - even * (remaining.length - 1)) * 100) / 100 : even,
      })),
    )
  }

  if (milestones.length === 0) {
    return (
      <div className="surface-quiet px-4 py-4">
        <p className="text-small font-medium text-chalk">Paid all at once</p>
        <p className="mt-0.5 text-small leading-relaxed text-chalk-muted">
          Splitting into milestones means neither side has the whole amount at risk at any one moment.
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={add}>
          <Plus aria-hidden className="h-3.5 w-3.5" />
          Add milestones
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {milestones.map((milestone, index) => (
        <div key={index} className="surface-quiet space-y-3 px-3.5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[0.7rem] text-chalk-muted">
              {index + 1}
            </span>
            <TextInput
              value={milestone.title}
              onChange={(event) => update(index, { title: event.target.value })}
              placeholder="What happens at this step"
              aria-label={`Milestone ${index + 1} title`}
              className="min-h-[2.5rem] flex-1 py-2 text-small"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove milestone ${index + 1}`}
              className="flex h-tap w-9 shrink-0 items-center justify-center rounded-lg text-chalk-faint active:bg-white/10"
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Share">
              {({ inputId }) => (
                <div className="relative">
                  <TextInput
                    id={inputId}
                    inputMode="decimal"
                    value={String(milestone.percent)}
                    onChange={(event) => {
                      const parsed = Number(event.target.value.replace(/[^\d.]/g, ''))
                      update(index, { percent: Number.isFinite(parsed) ? parsed : 0 })
                    }}
                    className="min-h-[2.5rem] py-2 pr-8 text-small"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-small text-chalk-faint">
                    %
                  </span>
                </div>
              )}
            </Field>

            <Field label="Due">
              {({ inputId }) => (
                <TextInput
                  id={inputId}
                  type="date"
                  value={milestone.dueDate}
                  onChange={(event) => update(index, { dueDate: event.target.value })}
                  className="min-h-[2.5rem] py-2 text-small"
                />
              )}
            </Field>
          </div>

          {amounts && (
            <p className="tabular text-[0.7rem] text-chalk-faint">
              This step is worth {formatAmount(amounts[index], currency)} {currency}
            </p>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between gap-3 px-1">
        <p className={cn('tabular text-[0.7rem]', balanced ? 'text-chalk-faint' : 'text-amber')}>
          {balanced ? 'Adds up to 100%' : `Adds up to ${Math.round(total * 100) / 100}% — needs to be 100%`}
        </p>
        <Button variant="ghost" size="sm" onClick={add}>
          <Plus aria-hidden className="h-3.5 w-3.5" />
          Add step
        </Button>
      </div>
    </div>
  )
}

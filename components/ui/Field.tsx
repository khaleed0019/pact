'use client'

import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Form fields.
 *
 * Labels are always real `<label>` elements bound by id — placeholder-as-label is the
 * most common accessibility failure in fintech UIs and it also loses the user's context
 * the moment they start typing. Errors are wired through `aria-describedby` and
 * `aria-invalid` so they are announced, not just coloured red.
 */

interface FieldShellProps {
  label: string
  hint?: string
  error?: string | null
  /** Right-aligned adornment on the label row, e.g. a character count or a unit toggle. */
  aside?: ReactNode
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode
  className?: string
}

export function Field({ label, hint, error, aside, children, className }: FieldShellProps) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-small font-medium text-chalk">
          {label}
        </label>
        {aside}
      </div>

      {children({ inputId, describedBy })}

      {hint && !error && (
        <p id={hintId} className="text-[0.7rem] leading-relaxed text-chalk-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[0.7rem] leading-relaxed text-rose">
          {error}
        </p>
      )}
    </div>
  )
}

const CONTROL =
  'w-full rounded-xl border bg-black/25 px-3.5 py-3 text-body text-chalk placeholder:text-chalk-faint ' +
  'transition-colors duration-150 focus:border-gold/50 focus:bg-black/35 focus:outline-none'

export function TextInput({
  error,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={error || undefined}
      className={cn(CONTROL, 'min-h-tap', error ? 'border-rose/50' : 'border-white/[0.09]', className)}
    />
  )
}

export function TextArea({
  error,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <textarea
      {...rest}
      aria-invalid={error || undefined}
      className={cn(CONTROL, 'resize-none leading-relaxed', error ? 'border-rose/50' : 'border-white/[0.09]', className)}
    />
  )
}

/**
 * Segmented control. Used for currency and role — choices where seeing every option at
 * once matters more than saving space, and a native select would hide the alternatives.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; hint?: string }>
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-2', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-tap rounded-xl border px-3 py-2.5 text-center transition-colors duration-150',
              selected
                ? 'border-gold/45 bg-gold/12 text-chalk'
                : 'border-white/[0.08] bg-white/[0.02] text-chalk-muted active:bg-white/[0.06]',
            )}
          >
            <span className="block text-small font-medium">{option.label}</span>
            {option.hint && <span className="mt-0.5 block text-[0.65rem] text-chalk-faint">{option.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

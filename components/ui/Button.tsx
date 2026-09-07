'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * The one button.
 *
 * Non-negotiables baked in rather than left to call sites:
 *  - minimum 44px height on every variant, because this is a phone app
 *  - `busy` renders a spinner *and* sets `disabled` + `aria-busy`, so a slow wallet call
 *    cannot be double-submitted by an impatient tap
 *  - `active:scale` instead of `hover:` styling, since there is no hover on touch
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-gold-bright to-gold text-ink-950 font-semibold shadow-glow-gold active:from-gold active:to-gold-deep',
  secondary: 'bg-white/[0.07] text-chalk border border-white/[0.09] active:bg-white/[0.11]',
  ghost: 'bg-transparent text-chalk-muted active:bg-white/[0.05]',
  quiet: 'bg-transparent text-chalk-muted underline underline-offset-4 decoration-white/25 active:text-chalk',
  danger: 'bg-rose/15 text-rose border border-rose/30 active:bg-rose/25',
}

const SIZES: Record<Size, string> = {
  sm: 'h-tap px-3.5 text-small rounded-xl',
  md: 'h-12 px-5 text-body rounded-xl',
  lg: 'h-[3.25rem] px-6 text-body rounded-2xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  busy?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', busy = false, fullWidth = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // A busy button is disabled: the wallet is already open, a second tap does nothing good.
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap',
        'transition-[transform,background-color,opacity] duration-150 ease-entrance',
        'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
})

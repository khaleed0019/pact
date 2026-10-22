'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemePreference } from '@/lib/client/theme'
import { cn } from '@/lib/cn'

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'Auto', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

/** Auto / Light / Dark. Auto follows the phone. A real radio group, keyboard-operable. */
export function ThemeSwitch({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme()
  return (
    <div role="radiogroup" aria-label="Appearance" className={cn('grid grid-cols-3 gap-1 rounded-xl bg-white/[0.05] p-1', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = preference === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(value)}
            className={cn(
              'focus-ring flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-[0.75rem] font-medium transition-colors',
              active ? 'bg-ink-850 text-chalk shadow-card' : 'text-chalk-muted active:bg-white/[0.06]',
            )}
          >
            <Icon aria-hidden className="h-3.5 w-3.5" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

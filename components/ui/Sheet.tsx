'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Bottom sheet.
 *
 * Sheets rather than centred dialogs because this is a one-handed phone app: the content
 * rises from the thumb, and the primary action lands where the thumb already is.
 *
 * Accessibility handled here so no call site has to remember it: focus moves in on open
 * and returns on close, Escape closes, the page behind is inert to scroll, and the
 * backdrop is a real button so screen readers announce a way out.
 */

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** Shown under the title. Keep it to one line. */
  description?: string
  children: ReactNode
  /** Pinned to the bottom, outside the scroll area, above the safe-area inset. */
  footer?: ReactNode
  /** Set false for a sheet the user must resolve (e.g. mid-payment). */
  dismissible?: boolean
}

export function Sheet({ open, onClose, title, description, children, footer, dismissible = true }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return

    restoreFocusTo.current = document.activeElement as HTMLElement | null
    // Focus the panel itself rather than the first control: on a phone, auto-focusing an
    // input raises the keyboard over the very content the user opened the sheet to read.
    panelRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onClose()
      if (event.key !== 'Tab' || !panelRef.current) return

      // Keep Tab inside the sheet.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      restoreFocusTo.current?.focus?.()
    }
  }, [open, onClose, dismissible])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.button
            type="button"
            aria-label="Close"
            tabIndex={dismissible ? 0 : -1}
            onClick={dismissible ? onClose : undefined}
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 340, mass: 0.8 }}
            className={cn(
              'relative flex max-h-[92dvh] w-full max-w-[34rem] flex-col',
              'rounded-t-sheet border-t border-white/10 bg-ink-850 shadow-sheet outline-none',
            )}
          >
            {/* Grab handle: the affordance that says "this is draggable-feeling". */}
            <div className="flex justify-center pt-2.5" aria-hidden>
              <div className="h-1 w-9 rounded-full bg-white/20" />
            </div>

            <header className="flex items-start gap-3 px-5 pb-3 pt-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-title text-chalk">{title}</h2>
                {description && <p className="mt-1 text-small leading-relaxed text-chalk-muted">{description}</p>}
              </div>
              {dismissible && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-1.5 -mt-1 flex h-tap w-tap items-center justify-center rounded-full text-chalk-faint active:bg-white/10"
                >
                  <X aria-hidden className="h-5 w-5" />
                </button>
              )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>

            {footer && (
              <div className="safe-bottom border-t border-white/[0.07] bg-ink-850/95 px-5 pt-3 backdrop-blur">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

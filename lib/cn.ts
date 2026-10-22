import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge, told about PACT's own type scale.
 *
 * Without this it cannot tell `text-body` (a font size, from tailwind.config.ts) from
 * `text-onsun` (a colour), assumes both are colours, and drops whichever came first — which
 * silently stripped the text colour from every primary button.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display-lg', 'display', 'title', 'heading', 'body', 'small', 'micro'] }],
    },
  },
})

/** Merge Tailwind classes so a caller's override actually wins over a component default. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

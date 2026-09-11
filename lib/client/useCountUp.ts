'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/**
 * Counts a number up to its real value once, on first appearance.
 *
 * Only ever used for figures that are already true — it animates the *arrival* of a
 * number, never the number itself. Nothing here rounds, estimates, or keeps climbing
 * past the value it was given.
 *
 * Honours the system reduced-motion setting by returning the final value immediately,
 * matching what globals.css does for every CSS animation in the app.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(reduced ? target : 0)
  const frame = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (reduced || target === 0) {
      setValue(target)
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1)
      // Ease out cubic: quick to begin, settling rather than stopping dead.
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)

    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    }
  }, [target, durationMs, reduced])

  return value
}

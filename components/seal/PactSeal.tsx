'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useId, useMemo } from 'react'
import type { PactStatus } from '@/lib/pact/types'

/**
 * THE PACT SEAL — the product's signature visual element.
 *
 * It is not decoration and it is not random. The ring is a direct rendering of the
 * agreement's terms fingerprint: each of the 32 hex characters of the Blake2b digest
 * becomes one tick, and that character's value sets the tick's length and weight.
 *
 * Two consequences, and they are the whole point:
 *
 *  - Every agreement has a seal that belongs to it alone. Two people comparing phones
 *    can see at a glance whether they are looking at the same terms, without reading a
 *    32-character hex string to each other.
 *  - **Changing any term visibly changes the seal.** Because the digest moves when the
 *    terms move, an edited agreement does not just say it changed — it *looks* different.
 *    A silently altered contract is the failure mode this product exists to prevent, and
 *    the brand mark is the thing that makes it impossible.
 *
 * The colour and the core glyph carry the lifecycle state on top of that identity.
 */

export type SealSize = 'xs' | 'sm' | 'md' | 'lg'

const GEOMETRY: Record<SealSize, { box: number; radius: number; minTick: number; maxTick: number; stroke: number }> = {
  xs: { box: 36, radius: 14, minTick: 2, maxTick: 4.5, stroke: 1.3 },
  sm: { box: 56, radius: 22, minTick: 3, maxTick: 7, stroke: 1.7 },
  md: { box: 96, radius: 38, minTick: 4.5, maxTick: 11, stroke: 2.2 },
  lg: { box: 168, radius: 66, minTick: 7, maxTick: 18, stroke: 3 },
}

/** Each state gets a colour pair used for the ring gradient and the core. */
const PALETTE: Record<PactStatus, { from: string; to: string; core: string; dim: boolean }> = {
  DRAFT: { from: '#646E7E', to: '#9AA4B2', core: '#9AA4B2', dim: true },
  PENDING: { from: '#E0912F', to: '#F7C948', core: '#E0912F', dim: false },
  NEGOTIATING: { from: '#8B7BE8', to: '#B9AFF2', core: '#8B7BE8', dim: false },
  ACTIVE: { from: '#B8880A', to: '#F7C948', core: '#E9B213', dim: false },
  IN_PROGRESS: { from: '#0582CA', to: '#3AA6E4', core: '#3AA6E4', dim: false },
  DELIVERED: { from: '#3AA6E4', to: '#7FD1F0', core: '#3AA6E4', dim: false },
  COMPLETED: { from: '#2F8E76', to: '#5FD3B4', core: '#3FA98E', dim: false },
  DISPUTED: { from: '#DC4C46', to: '#F0837E', core: '#DC4C46', dim: false },
  DECLINED: { from: '#8A3A36', to: '#DC4C46', core: '#8A3A36', dim: true },
  CANCELLED: { from: '#3A4049', to: '#646E7E', core: '#646E7E', dim: true },
}

/**
 * A stable 32-nibble reading of the digest.
 *
 * A draft has no meaningful fingerprint yet, so it gets an evenly-spaced neutral ring
 * rather than a fake one — an unsigned agreement should not wear a seal that looks
 * like a signed one.
 */
function ticksFrom(digest: string | null | undefined): number[] {
  if (!digest || digest.length < 32) return Array.from({ length: 32 }, (_, i) => (i % 2 === 0 ? 5 : 3))
  return Array.from({ length: 32 }, (_, i) => parseInt(digest[i % digest.length], 16) || 0)
}

interface CoreGlyphProps {
  status: PactStatus
  color: string
  scale: number
}

/** The centre mark. One clear idea per state, legible down to 36px. */
function CoreGlyph({ status, color, scale }: CoreGlyphProps) {
  const stroke = 2 * scale
  const common = {
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  }
  const s = (n: number) => n * scale

  switch (status) {
    case 'COMPLETED':
      return <path d={`M ${s(-6)} 0 L ${s(-1.5)} ${s(4.5)} L ${s(6.5)} ${s(-5)}`} {...common} />
    case 'ACTIVE':
      // A closed clasp: two signatures joined.
      return (
        <g {...common}>
          <path d={`M ${s(-6.5)} ${s(2)} a ${s(3.5)} ${s(3.5)} 0 1 1 ${s(5)} ${s(-3)}`} />
          <path d={`M ${s(6.5)} ${s(-2)} a ${s(3.5)} ${s(3.5)} 0 1 1 ${s(-5)} ${s(3)}`} />
        </g>
      )
    case 'PENDING':
      return (
        <g {...common}>
          <circle cx="0" cy="0" r={s(5.5)} />
          <path d={`M 0 ${s(-3)} L 0 0 L ${s(2.8)} ${s(1.6)}`} />
        </g>
      )
    case 'NEGOTIATING':
      return (
        <g {...common}>
          <path d={`M ${s(-6)} ${s(-2.5)} L ${s(4)} ${s(-2.5)}`} />
          <path d={`M ${s(1)} ${s(-5.5)} L ${s(4.5)} ${s(-2.5)} L ${s(1)} ${s(0.5)}`} />
          <path d={`M ${s(6)} ${s(3)} L ${s(-4)} ${s(3)}`} />
          <path d={`M ${s(-1)} ${s(0)} L ${s(-4.5)} ${s(3)} L ${s(-1)} ${s(6)}`} />
        </g>
      )
    case 'IN_PROGRESS':
      return (
        <g {...common}>
          <circle cx={s(-5)} cy={s(3)} r={s(1.6)} fill={color} stroke="none" />
          <circle cx="0" cy={s(-3)} r={s(1.6)} fill={color} stroke="none" />
          <circle cx={s(5)} cy={s(3)} r={s(1.6)} fill={color} stroke="none" />
        </g>
      )
    case 'DELIVERED':
      return (
        <g {...common}>
          <path d={`M ${s(-6)} ${s(-1)} L 0 ${s(-5)} L ${s(6)} ${s(-1)} L ${s(6)} ${s(4)} L ${s(-6)} ${s(4)} Z`} />
          <path d={`M ${s(-6)} ${s(-1)} L 0 ${s(2)} L ${s(6)} ${s(-1)}`} />
        </g>
      )
    case 'DISPUTED':
      return (
        <g {...common}>
          <path d={`M 0 ${s(-6)} L 0 ${s(1)}`} />
          <circle cx="0" cy={s(4.5)} r={s(0.9)} fill={color} stroke="none" />
        </g>
      )
    case 'DECLINED':
    case 'CANCELLED':
      return (
        <g {...common}>
          <path d={`M ${s(-5)} ${s(-5)} L ${s(5)} ${s(5)}`} />
          <path d={`M ${s(5)} ${s(-5)} L ${s(-5)} ${s(5)}`} />
        </g>
      )
    case 'DRAFT':
    default:
      return (
        <g {...common} strokeDasharray={`${s(2)} ${s(2.6)}`}>
          <circle cx="0" cy="0" r={s(5.5)} />
        </g>
      )
  }
}

export interface PactSealProps {
  status: PactStatus
  /** The terms fingerprint. Drives the ring geometry. */
  digest?: string | null
  size?: SealSize
  /** Play the draw-in animation. Used when a seal is first earned, not on every render. */
  animate?: boolean
  className?: string
  /** Accessible label. Falls back to a description of the state. */
  label?: string
}

export function PactSeal({ status, digest, size = 'md', animate = false, className, label }: PactSealProps) {
  const geometry = GEOMETRY[size]
  const palette = PALETTE[status]
  const gradientId = useId()
  const reduceMotion = useReducedMotion()
  const ticks = useMemo(() => ticksFrom(digest), [digest])

  const half = geometry.box / 2
  const scale = geometry.radius / 36
  const shouldAnimate = animate && !reduceMotion
  // These states are live — the agreement is waiting on somebody.
  const isBreathing = !reduceMotion && (status === 'PENDING' || status === 'NEGOTIATING')

  return (
    <svg
      viewBox={`0 0 ${geometry.box} ${geometry.box}`}
      width={geometry.box}
      height={geometry.box}
      className={className}
      role="img"
      aria-label={label ?? `Agreement seal, status ${status.toLowerCase().replace('_', ' ')}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.from} />
          <stop offset="100%" stopColor={palette.to} />
        </linearGradient>
        <radialGradient id={`${gradientId}-core`}>
          <stop offset="0%" stopColor={palette.to} stopOpacity="0.22" />
          <stop offset="100%" stopColor={palette.from} stopOpacity="0" />
        </radialGradient>
      </defs>

      <g transform={`translate(${half} ${half})`}>
        {/* Inner glow, so the core reads as lit rather than painted on. */}
        <circle cx="0" cy="0" r={geometry.radius * 0.82} fill={`url(#${gradientId}-core)`} />

        {/* The fingerprint ring. */}
        <motion.g
          opacity={palette.dim ? 0.5 : 1}
          initial={shouldAnimate ? { rotate: -18, opacity: 0 } : false}
          animate={shouldAnimate ? { rotate: 0, opacity: palette.dim ? 0.5 : 1 } : undefined}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          {ticks.map((nibble, index) => {
            const angle = (index / ticks.length) * Math.PI * 2 - Math.PI / 2
            const length = geometry.minTick + (nibble / 15) * (geometry.maxTick - geometry.minTick)
            const inner = geometry.radius - length / 2
            const outer = geometry.radius + length / 2

            return (
              <motion.line
                key={index}
                x1={Math.cos(angle) * inner}
                y1={Math.sin(angle) * inner}
                x2={Math.cos(angle) * outer}
                y2={Math.sin(angle) * outer}
                stroke={`url(#${gradientId})`}
                strokeWidth={geometry.stroke}
                strokeLinecap="round"
                initial={shouldAnimate ? { pathLength: 0, opacity: 0 } : false}
                animate={shouldAnimate ? { pathLength: 1, opacity: 1 } : undefined}
                transition={{
                  // Ticks appear in sequence, so the seal visibly "signs itself".
                  delay: 0.05 + index * 0.018,
                  duration: 0.35,
                  ease: 'easeOut',
                }}
              />
            )
          })}
        </motion.g>

        {/* A hairline containment ring — the difference between a mark and a scatter. */}
        <circle
          cx="0"
          cy="0"
          r={geometry.radius - geometry.maxTick / 2 - 3 * scale}
          fill="none"
          stroke={palette.core}
          strokeWidth={geometry.stroke * 0.55}
          opacity={0.42}
        />

        {isBreathing && (
          <circle
            cx="0"
            cy="0"
            r={geometry.radius + geometry.maxTick / 2 + 2}
            fill="none"
            stroke={palette.core}
            strokeWidth={geometry.stroke * 0.6}
            className="origin-center animate-pulse-ring"
          />
        )}

        <motion.g
          initial={shouldAnimate ? { scale: 0.6, opacity: 0 } : false}
          animate={shouldAnimate ? { scale: 1, opacity: 1 } : undefined}
          transition={{ delay: 0.55, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <CoreGlyph status={status} color={palette.core} scale={scale} />
        </motion.g>
      </g>
    </svg>
  )
}

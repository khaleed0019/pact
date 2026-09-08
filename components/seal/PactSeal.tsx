'use client'

import { useReducedMotion } from 'framer-motion'
import { useId, useMemo, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { PactStatus } from '@/lib/pact/types'

/**
 * THE PACT SEAL — the product's signature visual element.
 *
 * It is not decoration and it is not random. The ring is a direct rendering of the
 * agreement's terms fingerprint: each of the 32 hex characters of the Blake2b digest
 * becomes one tick, and that character's value sets the tick's length.
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
 * ## Why it lives rather than sits
 *
 * A seal for a *live* agreement should not look like a printed stamp. This renders as an
 * orb: a lit sphere with volume, the fingerprint ring turning slowly around it, a
 * counter-rotating inner arc, and a highlight orbiting the rim. Its rhythm is derived
 * from the digest too, so no two agreements breathe at quite the same rate. Terminal
 * states slow almost to a stop; states waiting on somebody pulse faster.
 *
 * ## Why every moving layer is a <div>, not an <svg> group
 *
 * This looks like over-engineering and is not. Measured in the target engine, a CSS
 * `transform` on an SVG `<g>` — and even on an `<svg>` element itself — computes to the
 * identity matrix and does nothing, while the same transform on an HTML `<div>` works
 * normally. An SVG group also reports `transform-origin: 0px 0px` regardless of what you
 * set, so a rotation that did apply would swing the ring around the viewport corner
 * instead of spinning it in place.
 *
 * So each animated layer is an absolutely-positioned `<div>` wrapping its own `<svg>`,
 * and the animation is applied to the div. Divs transform reliably everywhere, default
 * to a centred origin, and stay on the compositor — which also matters, because a list
 * screen can hold a dozen of these at once.
 */

export type SealSize = 'xs' | 'sm' | 'md' | 'lg'

const GEOMETRY: Record<SealSize, { box: number; radius: number; minTick: number; maxTick: number; stroke: number }> = {
  xs: { box: 36, radius: 14, minTick: 2, maxTick: 4.5, stroke: 1.3 },
  sm: { box: 56, radius: 22, minTick: 3, maxTick: 7, stroke: 1.7 },
  md: { box: 96, radius: 38, minTick: 4.5, maxTick: 11, stroke: 2.2 },
  lg: { box: 168, radius: 66, minTick: 7, maxTick: 18, stroke: 3 },
}

/** Each state gets a colour pair used for the ring gradient, the body and the core. */
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
 * How urgently a state should move.
 *
 * An agreement waiting on a human should feel like it is waiting. A finished one should
 * feel settled — near-still, not frozen, because a dead mark beside a live one reads as
 * a rendering bug rather than as a completed deal.
 */
const TEMPO: Record<PactStatus, number> = {
  DRAFT: 0.55,
  PENDING: 1.5,
  NEGOTIATING: 1.5,
  ACTIVE: 1,
  IN_PROGRESS: 1.2,
  DELIVERED: 1.2,
  COMPLETED: 0.6,
  DISPUTED: 1.9,
  DECLINED: 0.4,
  CANCELLED: 0.4,
}

/**
 * A stable 32-nibble reading of the digest.
 *
 * A draft has no meaningful fingerprint yet, so it gets an evenly-spaced neutral ring
 * rather than a fake one — an unsigned agreement should not wear a seal that looks like
 * a signed one.
 */
function ticksFrom(digest: string | null | undefined): number[] {
  if (!digest || digest.length < 32) return Array.from({ length: 32 }, (_, i) => (i % 2 === 0 ? 5 : 3))
  return Array.from({ length: 32 }, (_, i) => parseInt(digest[i % digest.length], 16) || 0)
}

/** Rotation speed, breathing rate and spin direction, all derived from the fingerprint. */
function rhythmFrom(digest: string | null | undefined, tempo: number) {
  const seed = digest && digest.length >= 4 ? parseInt(digest.slice(0, 4), 16) : 0x7c1a
  return {
    // 34–56s per revolution before tempo. Slow enough to read as drift, not spin.
    spin: (34 + (seed % 23)) / tempo,
    // The inner arc runs faster and the other way, which is what sells the depth.
    counterSpin: (13 + ((seed >> 5) % 9)) / tempo,
    breathe: (4.4 + ((seed >> 3) % 26) / 10) / tempo,
    glint: (9 + ((seed >> 9) % 7)) / tempo,
    reversed: (seed & 1) === 1,
  }
}

interface CoreGlyphProps {
  status: PactStatus
  color: string
  scale: number
}

/** The centre mark. One clear idea per state, legible down to 36px. Never rotates. */
function CoreGlyph({ status, color, scale }: CoreGlyphProps) {
  const common = {
    stroke: color,
    strokeWidth: 2 * scale,
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

/** One stacked layer of the orb. The animation lives on the div; the art lives in the svg. */
function Layer({
  box,
  animation,
  duration,
  children,
}: {
  box: number
  /** Omitted under reduced motion, which leaves the layer rendered but still. */
  animation?: string
  duration?: number
  children: ReactNode
}) {
  const style: CSSProperties | undefined = animation ? { animationDuration: `${duration}s` } : undefined
  return (
    <div className={cn('absolute inset-0', animation && 'orb-layer', animation)} style={style}>
      <svg viewBox={`0 0 ${box} ${box}`} width={box} height={box} aria-hidden focusable="false">
        {children}
      </svg>
    </div>
  )
}

export interface PactSealProps {
  status: PactStatus
  /** The terms fingerprint. Drives the ring geometry and the orb's rhythm. */
  digest?: string | null
  size?: SealSize
  /** Play the entrance flourish. Used when a seal is first earned, not on every render. */
  animate?: boolean
  className?: string
  /** Accessible label. Falls back to a description of the state. */
  label?: string
}

export function PactSeal({ status, digest, size = 'md', animate = false, className, label }: PactSealProps) {
  const geometry = GEOMETRY[size]
  const palette = PALETTE[status]
  const id = useId()
  const reduceMotion = useReducedMotion()

  const ticks = useMemo(() => ticksFrom(digest), [digest])
  const rhythm = useMemo(() => rhythmFrom(digest, TEMPO[status]), [digest, status])

  const box = geometry.box
  const half = box / 2
  const scale = geometry.radius / 36
  const moving = !reduceMotion

  // These read as detail at size and as noise at 36px in a list row.
  const showDetail = size !== 'xs'
  const bodyRadius = geometry.radius - geometry.maxTick / 2 - 2 * scale
  const spin = rhythm.reversed ? 'orb-spin-reverse' : 'orb-spin'
  const counter = rhythm.reversed ? 'orb-spin' : 'orb-spin-reverse'

  return (
    <div
      className={cn('relative shrink-0', animate && moving && 'orb-enter', className)}
      style={{ width: box, height: box }}
      role="img"
      aria-label={label ?? `Agreement seal, status ${status.toLowerCase().replace('_', ' ')}`}
    >
      {/* --- ambient halo, breathing ------------------------------------------------ */}
      <Layer box={box} animation={moving ? 'orb-glow' : undefined} duration={rhythm.breathe * 1.6}>
        <defs>
          <radialGradient id={`${id}-halo`}>
            <stop offset="55%" stopColor={palette.to} stopOpacity="0" />
            <stop offset="82%" stopColor={palette.to} stopOpacity="0.45" />
            <stop offset="100%" stopColor={palette.to} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={half} cy={half} r={half} fill={`url(#${id}-halo)`} opacity={palette.dim ? 0.45 : 1} />
      </Layer>

      {/* --- the sphere body, with the glyph riding along ---------------------------- */}
      <Layer box={box} animation={moving ? 'orb-breathe' : undefined} duration={rhythm.breathe}>
        <defs>
          {/* Lit from the upper left, falling away to a dark limb. This is what turns a
              flat disc into something with volume. */}
          <radialGradient id={`${id}-body`} cx="34%" cy="28%" r="78%">
            <stop offset="0%" stopColor={palette.to} stopOpacity="0.42" />
            <stop offset="45%" stopColor={palette.from} stopOpacity="0.2" />
            <stop offset="100%" stopColor="#04060A" stopOpacity="0.62" />
          </radialGradient>
          <radialGradient id={`${id}-spec`}>
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={half} cy={half} r={bodyRadius} fill={`url(#${id}-body)`} />
        <circle
          cx={half}
          cy={half}
          r={bodyRadius}
          fill="none"
          stroke={palette.core}
          strokeWidth={geometry.stroke * 0.5}
          opacity={0.45}
        />
        {/* Specular — offset up-left, matching the body gradient's light source. */}
        <ellipse
          cx={half - bodyRadius * 0.33}
          cy={half - bodyRadius * 0.4}
          rx={bodyRadius * 0.42}
          ry={bodyRadius * 0.3}
          fill={`url(#${id}-spec)`}
          opacity={palette.dim ? 0.35 : 0.7}
        />
        <g transform={`translate(${half} ${half})`}>
          <CoreGlyph status={status} color={palette.core} scale={scale} />
        </g>
      </Layer>

      {/* --- counter-rotating inner arc ----------------------------------------------
          Two elements turning opposite ways is the cheapest possible cue that this is a
          sphere and not a disc. */}
      {showDetail && (
        <Layer box={box} animation={moving ? counter : undefined} duration={rhythm.counterSpin}>
          <circle
            cx={half}
            cy={half}
            r={bodyRadius * 0.78}
            fill="none"
            stroke={palette.core}
            strokeWidth={geometry.stroke * 0.45}
            strokeLinecap="round"
            opacity={0.34}
            // Two short arcs rather than a full ring, so the rotation is legible.
            strokeDasharray={`${bodyRadius * 1.1} ${bodyRadius * 1.6}`}
          />
        </Layer>
      )}

      {/* --- the fingerprint ring, drifting ----------------------------------------- */}
      <Layer box={box} animation={moving ? spin : undefined} duration={rhythm.spin}>
        <defs>
          <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={palette.from} />
            <stop offset="100%" stopColor={palette.to} />
          </linearGradient>
        </defs>
        <g opacity={palette.dim ? 0.5 : 1}>
          {ticks.map((nibble, index) => {
            const angle = (index / ticks.length) * Math.PI * 2 - Math.PI / 2
            const length = geometry.minTick + (nibble / 15) * (geometry.maxTick - geometry.minTick)
            const inner = geometry.radius - length / 2
            const outer = geometry.radius + length / 2

            return (
              <line
                key={index}
                x1={half + Math.cos(angle) * inner}
                y1={half + Math.sin(angle) * inner}
                x2={half + Math.cos(angle) * outer}
                y2={half + Math.sin(angle) * outer}
                stroke={`url(#${id}-ring)`}
                strokeWidth={geometry.stroke}
                strokeLinecap="round"
              />
            )
          })}
        </g>
      </Layer>

      {/* --- the glint travelling the rim -------------------------------------------- */}
      {showDetail && moving && (
        <Layer box={box} animation="orb-spin" duration={rhythm.glint}>
          <defs>
            <radialGradient id={`${id}-glint`}>
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
              <stop offset="45%" stopColor={palette.to} stopOpacity="0.5" />
              <stop offset="100%" stopColor={palette.to} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={half} cy={half - geometry.radius} r={geometry.maxTick} fill={`url(#${id}-glint)`} />
        </Layer>
      )}
    </div>
  )
}

import { createElement as h } from 'react'
import type { ReactElement } from 'react'

/**
 * The one definition of PACT's static mark.
 *
 * Every rendered icon — the browser favicon, the apple-touch icon, and the standalone
 * file handed over for the competition submission form — comes from this single
 * function, at whatever size and level of detail fits. That's deliberate: a mark that
 * looks slightly different in three places stops being a mark.
 *
 * It isn't a new design. It's components/seal/PactSeal.tsx's ACTIVE state — the state
 * the whole product exists to reach, where both signatures are in and the terms are
 * locked — same palette, same "closed clasp" glyph (two arcs standing for two
 * signatures joined), reduced to what survives as a static, small mark. The full
 * fingerprint ring (32 individually-sized ticks, driven by a real agreement's digest)
 * only reads as a ring rather than noise above a certain size, so `ticks` scales with
 * `size` rather than being fixed.
 */

export interface SealIconOptions {
  size: number
  /** How many fingerprint ticks to draw. 0 omits the ring entirely (true favicon scale). */
  ticks?: number
  /** Fill the full canvas edge-to-edge. Off for a monogram meant to sit on its own background. */
  background?: boolean
}

// A fixed, pleasant tick pattern — not tied to any one agreement's real digest, since
// this mark represents the product, not a specific PACT.
const TICK_PATTERN = [7, 3, 9, 5, 2, 8, 4, 10, 6, 3, 9, 5, 7, 2, 8, 4, 10, 6, 3, 9, 5, 8, 2, 7, 4, 10, 6, 3, 9, 5, 8, 4]

export function sealIconElement({ size, ticks = 0, background = true }: SealIconOptions): ReactElement {
  const half = size / 2
  const ringRadius = size * 0.32
  const bodyRadius = size * 0.245
  const strokeWidth = Math.max(size * 0.018, 1)

  const tickCount = Math.min(ticks, TICK_PATTERN.length)
  const tickElements = Array.from({ length: tickCount }, (_, i) => {
    const angle = (i / tickCount) * Math.PI * 2 - Math.PI / 2
    const value = TICK_PATTERN[i % TICK_PATTERN.length]
    const minLen = size * 0.02
    const maxLen = size * 0.06
    const length = minLen + (value / 10) * (maxLen - minLen)
    const inner = ringRadius - length / 2
    const outer = ringRadius + length / 2
    return h('line', {
      key: i,
      x1: half + Math.cos(angle) * inner,
      y1: half + Math.sin(angle) * inner,
      x2: half + Math.cos(angle) * outer,
      y2: half + Math.sin(angle) * outer,
      stroke: 'url(#pact-ring)',
      strokeWidth,
      strokeLinecap: 'round',
    })
  })

  const clasp = (() => {
    const r = size * 0.145
    const cx = half
    const cy = half
    const s = size / 32 // scale factor against the hand-tuned 32px design below
    return h(
      'g',
      null,
      h('path', {
        d: `M ${cx - 6.5 * s} ${cy + 2 * s} A ${r} ${r} 0 1 1 ${cx} ${cy - 4.7 * s}`,
        fill: 'none',
        stroke: '#F7C948',
        strokeWidth: size * 0.08,
        strokeLinecap: 'round',
      }),
      h('path', {
        d: `M ${cx + 6.5 * s} ${cy - 2 * s} A ${r} ${r} 0 1 1 ${cx} ${cy + 4.7 * s}`,
        fill: 'none',
        stroke: '#F7C948',
        strokeWidth: size * 0.08,
        strokeLinecap: 'round',
      }),
    )
  })()

  const svg = h(
    'svg',
    { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
    h(
      'defs',
      null,
      h(
        'radialGradient',
        { id: 'pact-glow', cx: '50%', cy: '50%', r: '50%' },
        h('stop', { offset: '0%', stopColor: '#F7C948', stopOpacity: 0.5 }),
        h('stop', { offset: '100%', stopColor: '#F7C948', stopOpacity: 0 }),
      ),
      h(
        'radialGradient',
        { id: 'pact-body', cx: '34%', cy: '28%', r: '78%' },
        h('stop', { offset: '0%', stopColor: '#F7C948', stopOpacity: 0.4 }),
        h('stop', { offset: '45%', stopColor: '#B8880A', stopOpacity: 0.22 }),
        h('stop', { offset: '100%', stopColor: '#04060A', stopOpacity: 0.7 }),
      ),
      h(
        'linearGradient',
        { id: 'pact-ring', x1: '0', y1: '0', x2: '1', y2: '1' },
        h('stop', { offset: '0%', stopColor: '#B8880A' }),
        h('stop', { offset: '100%', stopColor: '#F7C948' }),
      ),
    ),
    background && h('rect', { x: 0, y: 0, width: size, height: size, fill: '#0B0D10' }),
    h('circle', { cx: half, cy: half, r: size * 0.49, fill: 'url(#pact-glow)' }),
    tickCount > 0 && h('g', null, ...tickElements),
    h('circle', { cx: half, cy: half, r: bodyRadius, fill: 'url(#pact-body)' }),
    h('circle', {
      cx: half,
      cy: half,
      r: bodyRadius,
      fill: 'none',
      stroke: '#E9B213',
      strokeWidth: strokeWidth * 0.8,
      opacity: 0.5,
    }),
    clasp,
  )

  return svg
}

/** Wraps the mark in a centring flex container — what ImageResponse actually renders. */
export function sealIconResponseTree(options: SealIconOptions): ReactElement {
  return h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: options.background === false ? 'transparent' : '#0B0D10',
      },
    },
    sealIconElement({ ...options, background: false }),
  )
}

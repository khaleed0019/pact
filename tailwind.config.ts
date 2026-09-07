import type { Config } from 'tailwindcss'

/**
 * PACT design tokens.
 *
 * The palette is deliberately adjacent to Nimiq Pay (gold primary, blue secondary)
 * so the Mini App feels native inside the host app, without cloning it. Surfaces are
 * a warm near-black rather than pure #000 — pure black reads as "unstyled" on OLED
 * phones and kills the sense of depth we need for the card stack.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Canvas / surfaces
        ink: {
          950: '#07080A', // page behind everything
          900: '#0B0D10', // app canvas
          850: '#111419', // raised card
          800: '#171B21', // hovered / nested card
          700: '#1F242C', // input, divider-heavy surfaces
          600: '#2B313B',
        },
        // Text
        chalk: {
          DEFAULT: '#F4F6F8',
          muted: '#9AA4B2',
          faint: '#646E7E',
        },
        // Nimiq-adjacent brand
        gold: {
          DEFAULT: '#E9B213',
          bright: '#F7C948',
          deep: '#B8880A',
        },
        azure: {
          DEFAULT: '#0582CA',
          bright: '#3AA6E4',
          deep: '#04618F',
        },
        // Semantic
        jade: '#3FA98E', // success / completed / confirmed
        amber: '#E0912F', // waiting / pending
        rose: '#DC4C46', // failed / disputed / declined
        violet: '#8B7BE8', // negotiation
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Mobile-first type scale. Display sizes carry tight tracking (Linear/Stripe feel).
        'display-lg': ['2.25rem', { lineHeight: '1.05', letterSpacing: '-0.035em', fontWeight: '680' }],
        display: ['1.75rem', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '660' }],
        title: ['1.3125rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '640' }],
        heading: ['1.0625rem', { lineHeight: '1.3', letterSpacing: '-0.012em', fontWeight: '620' }],
        body: ['0.9375rem', { lineHeight: '1.55', letterSpacing: '-0.005em' }],
        small: ['0.8125rem', { lineHeight: '1.5' }],
        micro: ['0.6875rem', { lineHeight: '1.35', letterSpacing: '0.06em' }],
      },
      borderRadius: {
        card: '1.125rem',
        sheet: '1.5rem',
        pill: '999px',
      },
      boxShadow: {
        // Depth comes from a light top edge + a soft drop, not a heavy blur.
        card: '0 1px 0 0 rgba(255,255,255,0.045) inset, 0 8px 24px -12px rgba(0,0,0,0.75)',
        lift: '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 20px 48px -20px rgba(0,0,0,0.9)',
        sheet: '0 -8px 48px -12px rgba(0,0,0,0.85)',
        'glow-gold': '0 0 0 1px rgba(233,178,19,0.28), 0 8px 32px -12px rgba(233,178,19,0.4)',
      },
      spacing: {
        // Guaranteed-tappable target. Referenced by name so it can't drift.
        tap: '2.75rem', // 44px
        'safe-b': 'env(safe-area-inset-bottom)',
      },
      transitionTimingFunction: {
        entrance: 'cubic-bezier(0.16, 1, 0.3, 1)',
        exit: 'cubic-bezier(0.4, 0, 1, 1)',
      },
      keyframes: {
        'seal-draw': { from: { strokeDashoffset: '1' }, to: { strokeDashoffset: '0' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%, 100%': { opacity: '0.35', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.04)' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2.6s ease-in-out infinite',
        'rise-in': 'rise-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}

export default config

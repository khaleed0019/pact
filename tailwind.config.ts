import type { Config } from 'tailwindcss'

/**
 * PACT design tokens.
 *
 * The palette is deliberately adjacent to Nimiq Pay (gold primary, blue secondary)
 * so the Mini App feels native inside the host app, without cloning it. Surfaces are
 * a warm near-black rather than pure #000 — pure black reads as "unstyled" on OLED
 * phones and kills the sense of depth we need for the card stack.
 */
/** A themed colour: `rgb(var(--name) / alpha)`. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /*
         * Every themed colour is a CSS variable holding "r g b" channels, so the same class
         * (`bg-ink-850`, `text-chalk`, `bg-white/[0.05]`) works in both themes and Tailwind's
         * `/opacity` modifiers keep working. Values live in app/globals.css under :root
         * (dark) and [data-theme='light'].
         *
         * `white` and `black` are themed on purpose: across the app they mean "a tint of the
         * foreground" and "a shade under it" (hairlines, overlays, input wells), which must
         * invert with the theme. A literal white uses `[#fff]`.
         */
        ink: {
          950: v('ink-950'),
          900: v('ink-900'),
          850: v('ink-850'),
          800: v('ink-800'),
          700: v('ink-700'),
          600: v('ink-600'),
        },
        chalk: { DEFAULT: v('chalk'), muted: v('chalk-muted'), faint: v('chalk-faint') },
        gold: { DEFAULT: v('gold'), bright: v('gold-bright'), deep: v('gold-deep') },
        azure: { DEFAULT: v('azure'), bright: v('azure-bright'), deep: v('azure-deep') },
        jade: v('jade'),
        amber: v('amber'),
        rose: v('rose'),
        violet: v('violet'),
        white: v('tint'),
        black: v('shade'),
        // Fixed in both themes: the gold of a primary button and the ink on top of it.
        sun: { DEFAULT: '#E9B213', light: '#F7C948', deep: '#B8880A' },
        onsun: '#07080A',
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
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        sheet: 'var(--shadow-sheet)',
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

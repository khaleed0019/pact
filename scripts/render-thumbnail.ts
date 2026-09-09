/**
 * Render the YouTube thumbnail (1280x720) — same Seal used everywhere else in the brand,
 * this time paired with the wordmark since a thumbnail has to read from a small, busy
 * feed rather than sit inside the app.
 *
 * Needs real font data: unlike the icon renders, this one draws text, and next/og's
 * ImageResponse (Satori under the hood) has no access to system fonts in a standalone
 * script — it only knows glyphs from whatever's passed via the `fonts` option.
 *
 * That font data has to be static, per-weight ttf/otf — Satori's bundled parser throws
 * on woff2 ("Unsupported OpenType signature wOF2") and can't read a variable font's fvar
 * table at all (throws parsing the axis definitions). Google's own fonts repo only
 * publishes Inter as a variable font now, so the three weights below are the static ttfs
 * from Inter's own upstream release (rsms/inter, OFL-licensed, extras/ttf/) — checked
 * into scripts/.fonts/ once rather than re-fetched per run.
 *
 * Usage: node scripts/render-thumbnail.ts
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createElement as h } from 'react'
import { ImageResponse } from 'next/og.js'
import { sealIconElement } from '../lib/brand/sealIcon.ts'

const FONT_DIR = join(import.meta.dirname, '.fonts')

async function loadFont(weight: 400 | 600 | 800): Promise<ArrayBuffer> {
  const buf = await readFile(join(FONT_DIR, `Inter-${weight}.ttf`))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const WIDTH = 1280
const HEIGHT = 720

const tree = h(
  'div',
  {
    style: {
      width: WIDTH,
      height: HEIGHT,
      display: 'flex',
      alignItems: 'center',
      background: '#07080A',
      fontFamily: 'Inter',
    },
  },
  // Left: the Seal, at hero scale with the full fingerprint ring.
  h(
    'div',
    { style: { display: 'flex', width: 560, height: HEIGHT, alignItems: 'center', justifyContent: 'center' } },
    sealIconElement({ size: 460, ticks: 32, background: false }),
  ),
  // Right: wordmark + tagline.
  h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 64 } },
    h(
      'div',
      {
        style: {
          display: 'flex',
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: 6,
          textTransform: 'uppercase',
          color: '#B8880A',
        },
      },
      'Nimiq Pay Mini App',
    ),
    h(
      'div',
      { style: { display: 'flex', fontSize: 168, fontWeight: 800, letterSpacing: -6, color: '#F7C948', lineHeight: 1 } },
      'PACT',
    ),
    h(
      'div',
      { style: { display: 'flex', fontSize: 36, fontWeight: 400, color: '#9AA4B2', maxWidth: 620 } },
      'Sign it. Track it. Pay it.',
    ),
  ),
)

const [regular, semibold, extrabold] = await Promise.all([loadFont(400), loadFont(600), loadFont(800)])

const response = new ImageResponse(tree, {
  width: WIDTH,
  height: HEIGHT,
  fonts: [
    { name: 'Inter', data: regular, weight: 400, style: 'normal' },
    { name: 'Inter', data: semibold, weight: 600, style: 'normal' },
    { name: 'Inter', data: extrabold, weight: 800, style: 'normal' },
  ],
})

const buffer = Buffer.from(await response.arrayBuffer())
const outfile = 'public/brand/pact-youtube-thumbnail.png'
await mkdir(dirname(outfile), { recursive: true })
await writeFile(outfile, buffer)
console.log(`wrote ${outfile} (${buffer.length} bytes, ${WIDTH}x${HEIGHT})`)

/**
 * Render a standalone, high-resolution PNG of PACT's mark — for the competition
 * submission form, not for the running app (the app gets its icons from
 * app/icon.tsx and app/apple-icon.tsx, built from the same lib/brand/sealIcon.ts).
 *
 * Runs outside Next's request pipeline: `next/og`'s ImageResponse returns a standard
 * web Response wrapping a PNG stream, which Node can consume directly with no server.
 *
 * Usage: node scripts/render-icon.ts [size] [outfile]
 *   node scripts/render-icon.ts 512  public/brand/pact-icon-512.png
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ImageResponse } from 'next/og.js'
import { sealIconResponseTree } from '../lib/brand/sealIcon.ts'

const size = Number(process.argv[2] ?? 512)
const outfile = process.argv[3] ?? `public/brand/pact-icon-${size}.png`

// Full fingerprint ring at this resolution — this is the "hero" version, the one
// that has room for every detail the small favicon has to drop.
const ticks = size >= 256 ? 32 : size >= 96 ? 20 : 0

const response = new ImageResponse(sealIconResponseTree({ size, ticks }), { width: size, height: size })
const buffer = Buffer.from(await response.arrayBuffer())

await mkdir(dirname(outfile), { recursive: true })
await writeFile(outfile, buffer)
console.log(`wrote ${outfile} (${buffer.length} bytes, ${size}x${size})`)

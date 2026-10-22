#!/usr/bin/env node
/**
 * Record the PACT demo walkthrough with Playwright.
 *
 *   node demo/record.mjs <baseUrl> <outDir>
 *
 * Needs `playwright` installed where this file runs (it is not a project dependency).
 * Drives the real app at phone size against a local in-memory server seeded by
 * demo/seed.mjs. Each scene lasts at least as long as its narration clip
 * (demo/build/audio/<id>.wav); the start time of every scene is written to
 * timeline.json so the narration and chapter titles can be laid over the video exactly.
 *
 * A visible tap indicator is injected into the page only for the recording — Playwright's
 * video does not capture the real cursor.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:3100'
const OUT = path.resolve(process.argv[3] ?? 'demo/build')
// The repo root. PACT_ROOT lets the script run from wherever playwright is installed.
const ROOT = path.resolve(process.env.PACT_ROOT ?? path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..'))
const scenes = JSON.parse(readFileSync(path.join(ROOT, 'demo/narration.json'), 'utf8'))
const audioDir = path.join(ROOT, 'demo/build/audio')

const duration = (id) =>
  Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(audioDir, `${id}.wav`)])
      .toString()
      .trim(),
  )

const VIEW = { width: 430, height: 932 }
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  // Recorded at CSS size: Playwright does not upscale into a larger frame, it pads it.
  recordVideo: { dir: OUT, size: VIEW },
})

// Tap indicator + dark theme on first load (the theme scene switches it through the UI).
await context.addInitScript(() => {
  try {
    if (!localStorage.getItem('pact-demo-started')) {
      localStorage.setItem('pact-theme', 'dark')
      localStorage.setItem('pact-demo-started', '1')
    }
  } catch {}
  const install = () => {
    if (document.getElementById('__demo_cursor')) return
    const dot = document.createElement('div')
    dot.id = '__demo_cursor'
    Object.assign(dot.style, {
      position: 'fixed', zIndex: 2147483647, width: '26px', height: '26px', borderRadius: '50%',
      border: '2px solid rgba(247,201,72,0.95)', background: 'rgba(247,201,72,0.18)',
      boxShadow: '0 0 0 4px rgba(0,0,0,0.25)', pointerEvents: 'none', left: '-60px', top: '-60px',
      transform: 'translate(-50%,-50%)', transition: 'left 650ms cubic-bezier(.16,1,.3,1), top 650ms cubic-bezier(.16,1,.3,1), transform 120ms',
    })
    document.body.appendChild(dot)
    window.__demoMove = (x, y) => { dot.style.left = x + 'px'; dot.style.top = y + 'px' }
    window.__demoTap = () => {
      dot.style.transform = 'translate(-50%,-50%) scale(0.7)'
      setTimeout(() => (dot.style.transform = 'translate(-50%,-50%) scale(1)'), 160)
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install)
  else install()
})

const page = await context.newPage()
const t0 = Date.now()
const timeline = []
const sleep = (ms) => page.waitForTimeout(ms)

let cursor = { x: VIEW.width / 2, y: VIEW.height * 0.55 }
async function moveTo(x, y) {
  cursor = { x, y }
  await page.evaluate(([x, y]) => window.__demoMove?.(x, y), [x, y])
  await sleep(700)
}

/** Scroll an element to the middle smoothly, glide the indicator to it, then tap it. */
async function tap(locator, { pause = 450 } = {}) {
  await locator.waitFor({ state: 'visible', timeout: 15000 })
  await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  await sleep(750)
  const box = await locator.boundingBox()
  await moveTo(box.x + box.width / 2, box.y + box.height / 2)
  await page.evaluate(() => window.__demoTap?.())
  await sleep(180)
  await locator.click()
  await sleep(pause)
}

async function typeInto(locator, text, delay = 55) {
  await tap(locator, { pause: 200 })
  await locator.pressSequentially(text, { delay })
  await sleep(350)
}

/** Smooth scroll by `px` over `ms`. */
async function glide(px, ms = 1600) {
  await page.evaluate(
    ([px, ms]) =>
      new Promise((resolve) => {
        const from = window.scrollY
        const start = performance.now()
        const ease = (t) => 1 - Math.pow(1 - t, 3)
        const step = (now) => {
          const t = Math.min(1, (now - start) / ms)
          window.scrollTo(0, from + px * ease(t))
          t < 1 ? requestAnimationFrame(step) : resolve()
        }
        requestAnimationFrame(step)
      }),
    [px, ms],
  )
  await sleep(250)
}

async function scrollToText(text, offset = 90) {
  await page.evaluate(
    ([text, offset]) => {
      const el = [...document.querySelectorAll('h1,h2,p,span')].find((e) => e.textContent?.trim().toLowerCase() === text.toLowerCase())
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' })
    },
    [text, offset],
  )
  await sleep(1100)
}

async function scene(id, run) {
  const start = (Date.now() - t0) / 1000
  const need = duration(id) + 0.9
  timeline.push({ id, start })
  console.log(`scene ${id} @ ${start.toFixed(2)}s (narration ${need.toFixed(1)}s)`)
  await run()
  const spent = (Date.now() - t0) / 1000 - start
  if (spent < need) await sleep((need - spent) * 1000)
}

const nav = (name) => page.locator('nav[aria-label="Primary"]').getByRole('link', { name, exact: true }).first()

// ------------------------------------------------------------------------------ scenes
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await sleep(600)

await scene('intro', async () => {
  await moveTo(VIEW.width / 2, 300)
  await sleep(1500)
  await moveTo(VIEW.width / 2, 560)
})

await scene('landing', async () => {
  await glide(820, 2200)
  await sleep(2600)
  await glide(760, 2200)
  await sleep(2600)
  await glide(820, 2200)
  await sleep(2000)
  await glide(-3000, 1800)
})

await scene('role', async () => {
  await tap(page.getByRole('button', { name: /Explore the demo/ }), { pause: 1600 })
  await tap(page.getByRole('radio', { name: /I’m a Contributor/ }), { pause: 900 })
  await tap(page.getByRole('button', { name: /Continue as Contributor/ }), { pause: 1500 })
})

await scene('contributor-home', async () => {
  await sleep(1200)
  await moveTo(220, 330)
  await sleep(1800)
  await glide(420, 1600)
  await sleep(2200)
  await glide(-420, 1400)
})

await scene('find-work', async () => {
  await tap(nav('Find work'), { pause: 1400 })
  await tap(page.getByRole('tab', { name: /^Open/ }), { pause: 1100 })
  await tap(page.getByRole('button', { name: 'Video', exact: true }), { pause: 1500 })
  await tap(page.getByRole('button', { name: 'All', exact: true }), { pause: 900 })
  await tap(page.getByRole('button', { name: 'USDT', exact: true }), { pause: 1400 })
  await tap(page.getByRole('button', { name: 'Any currency', exact: true }), { pause: 800 })
})

await scene('search', async () => {
  await typeInto(page.getByRole('searchbox', { name: 'Search campaigns' }), 'banner')
  await sleep(900)
  await tap(page.getByText('Design a launch banner set').first(), { pause: 1600 })
  await glide(380, 1600)
  await sleep(1500)
})

await scene('preview', async () => {
  await tap(page.getByRole('button', { name: 'Review the agreement' }), { pause: 1000 })
  await glide(520, 1800)
  await sleep(2400)
  await glide(420, 1600)
  await sleep(1200)
})

await scene('invitation', async () => {
  await tap(page.getByRole('link', { name: 'Back' }), { pause: 1400 })
  await tap(page.getByRole('tab', { name: /^Invitations/ }), { pause: 1600 })
  await moveTo(215, 360)
  await sleep(1500)
})

await scene('accept', async () => {
  await tap(page.getByRole('link', { name: 'Review invitation' }).first(), { pause: 1600 })
  await glide(600, 1800)
  await sleep(1200)
  await tap(page.getByRole('button', { name: /Accept — you’ll sign next/ }), { pause: 2200 })
})

await scene('agreement', async () => {
  await scrollToText('Progress')
  await sleep(2600)
  await glide(320, 1500)
  await sleep(1500)
})

await scene('switch', async () => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await sleep(600)
  await tap(page.getByRole('button', { name: /Account menu/ }), { pause: 1200 })
  await tap(page.getByRole('menuitem', { name: /Switch from Contributor/ }), { pause: 1200 })
  await tap(page.getByRole('radio', { name: /I’m a Brand/ }), { pause: 700 })
  await tap(page.getByRole('button', { name: /Continue as Brand/ }), { pause: 1400 })
})

await scene('brand-home', async () => {
  await moveTo(215, 330)
  await sleep(2500)
})

await scene('post', async () => {
  await tap(page.getByRole('link', { name: /Post work/ }).first(), { pause: 1400 })
  await tap(page.getByRole('radio', { name: /Invite only/ }), { pause: 700 })
  await tap(page.getByRole('radio', { name: 'Video', exact: true }), { pause: 600 })
  await typeInto(page.getByLabel('What’s the work?'), 'Edit a 15 second app teaser')
  await typeInto(page.getByLabel('The brief'), 'Cut our screen recording into a 15 second vertical teaser with captions.', 28)
  await typeInto(page.getByRole('textbox', { name: 'Requirement 1' }), 'Vertical 9:16', 45)
})

await scene('invite', async () => {
  await typeInto(page.getByRole('textbox', { name: 'Invite by handle or Nimiq address' }), '@maya', 90)
  await sleep(1300)
  await tap(page.getByRole('button', { name: /@maya_edits/ }), { pause: 900 })
  await typeInto(page.getByLabel(/Reward per person/), '20')
  const spots = page.getByLabel('Spots')
  await tap(spots, { pause: 150 })
  await spots.fill('1')
  await page.getByLabel('Deadline').fill('2026-11-15')
  await sleep(600)
})

await scene('owner', async () => {
  await tap(page.getByRole('button', { name: /Send to 1 person/ }), { pause: 2000 })
  await scrollToText('Budget')
  await sleep(2200)
  await scrollToText('Invitations')
  await sleep(2000)
})

await scene('payments', async () => {
  await page.goto(BASE + '/p/demo-website', { waitUntil: 'networkidle' })
  await sleep(500)
  await scrollToText('Progress')
  await sleep(2400)
  await scrollToText('Payments')
  await sleep(3200)
})

await scene('theme', async () => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await sleep(500)
  await tap(page.getByRole('button', { name: /Account menu/ }), { pause: 900 })
  await tap(page.getByRole('radio', { name: 'Light' }), { pause: 1400 })
  await page.keyboard.press('Escape')
  await sleep(1200)
})

await scene('outro', async () => {
  await tap(page.getByRole('button', { name: /Account menu/ }), { pause: 800 })
  await tap(page.getByRole('menuitem', { name: /Sign out/ }), { pause: 2000 })
  await moveTo(-60, -60)
  await sleep(2500)
})

const total = (Date.now() - t0) / 1000
const video = page.video()
await context.close()
await browser.close()
const videoPath = await video.path()
writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ total, video: videoPath, scenes: timeline }, null, 2))
console.log(`recorded ${total.toFixed(1)}s → ${videoPath}`)

#!/usr/bin/env node
/**
 * Compose the final demo video.
 *
 *   PACT_ROOT=<repo> node demo/compose.mjs
 *
 * Inputs (all under demo/build): the Playwright recording named in timeline.json, the
 * narration clips in audio/, and demo/narration.json for chapter titles and captions.
 * Output: demo/PACT-demo.mp4 (1920x1080, H.264 + AAC, with a soft English subtitle track)
 * and demo/PACT-demo.srt.
 *
 * Needs ffmpeg on PATH, and playwright (to render the background and the phone mask).
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.env.PACT_ROOT ?? '.')
const BUILD = path.join(ROOT, 'demo/build')
const scenes = JSON.parse(readFileSync(path.join(ROOT, 'demo/narration.json'), 'utf8'))
const timeline = JSON.parse(readFileSync(path.join(BUILD, 'timeline.json'), 'utf8'))

const W = 1920
const H = 1080
const PHONE_H = 1000
const PHONE_W = 462 // 860x1864 scaled to 1000 high, rounded to even
const PHONE_X = 1288
const PHONE_Y = 40
const RADIUS = 44

const probe = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())

// ------------------------------------------------------------- background + phone mask
mkdirSync(path.join(BUILD, 'compose'), { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.setContent(`<!doctype html><html><head><style>
  html,body{margin:0;width:${W}px;height:${H}px;background:#07080A;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif}
  .glow1{position:absolute;left:-260px;top:-320px;width:1100px;height:1100px;border-radius:50%;background:radial-gradient(circle,rgba(233,178,19,.16),transparent 62%)}
  .glow2{position:absolute;right:-200px;bottom:-380px;width:1100px;height:1100px;border-radius:50%;background:radial-gradient(circle,rgba(5,130,202,.16),transparent 62%)}
  .brand{position:absolute;left:150px;top:92px;display:flex;align-items:center;gap:18px;color:#F4F6F8}
  .mark{width:46px;height:46px;border-radius:50%;border:3px solid #E9B213;box-shadow:0 0 24px rgba(233,178,19,.45)}
  .name{font-size:40px;font-weight:700;letter-spacing:.06em}
  .tag{position:absolute;left:150px;top:160px;color:#9AA4B2;font-size:24px}
  .rule{position:absolute;left:150px;top:220px;width:120px;height:3px;background:#E9B213;border-radius:2px}
  .bezel{position:absolute;left:${PHONE_X - 12}px;top:${PHONE_Y - 12}px;width:${PHONE_W + 24}px;height:${PHONE_H + 24}px;border-radius:${RADIUS + 12}px;
    background:#111419;border:1px solid rgba(255,255,255,.12);box-shadow:0 40px 120px -30px rgba(0,0,0,.9),0 0 0 1px rgba(233,178,19,.08)}
  .foot{position:absolute;left:150px;bottom:70px;color:#646E7E;font-size:20px}
</style></head><body>
  <div class="glow1"></div><div class="glow2"></div>
  <div class="brand"><div class="mark"></div><div class="name">PACT</div></div>
  <div class="tag">A Nimiq Pay Mini App · product walkthrough</div>
  <div class="rule"></div>
  <div class="bezel"></div>
  <div class="foot">Recorded from the real app running locally with sample data · github.com/khaleed0019/pact</div>
</body></html>`)
await page.screenshot({ path: path.join(BUILD, 'compose/bg.png') })
await page.setViewportSize({ width: PHONE_W, height: PHONE_H })
await page.setContent(`<html><body style="margin:0;background:#000"><div style="width:${PHONE_W}px;height:${PHONE_H}px;border-radius:${RADIUS}px;background:#fff"></div></body></html>`)
await page.screenshot({ path: path.join(BUILD, 'compose/mask.png') })
await browser.close()

// ------------------------------------------------------------------ captions + srt
for (const f of ['segoeui.ttf', 'segoeuib.ttf', 'segoeuisl.ttf']) copyFileSync(`C:/Windows/Fonts/${f}`, path.join(BUILD, 'compose', f))

const wrap = (text, width) => {
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > width) {
      lines.push(line.trim())
      line = word
    } else line += ' ' + word
  }
  if (line.trim()) lines.push(line.trim())
  return lines
}

const video = timeline.video
const total = probe(video)
const items = scenes.map((s, i) => {
  const start = timeline.scenes.find((t) => t.id === s.id).start
  const next = timeline.scenes[i + 1]?.start ?? total
  return { ...s, index: i + 1, start, end: next, audio: path.join(BUILD, 'audio', `${s.id}.wav`) }
})

const srtTime = (t) => {
  const ms = Math.round(t * 1000)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}
let srt = ''
for (const it of items) {
  writeFileSync(path.join(BUILD, `compose/title-${it.id}.txt`), it.chapter)
  writeFileSync(path.join(BUILD, `compose/num-${it.id}.txt`), `${String(it.index).padStart(2, '0')}  /  ${items.length}`)
  writeFileSync(path.join(BUILD, `compose/cap-${it.id}.txt`), wrap(it.text, 44).join('\n'))
  const spoken = probe(it.audio)
  srt += `${it.index}\n${srtTime(it.start)} --> ${srtTime(Math.min(it.end, it.start + spoken + 0.4))}\n${wrap(it.text, 60).join('\n')}\n\n`
}
writeFileSync(path.join(ROOT, 'demo/PACT-demo.srt'), srt)
writeFileSync(path.join(BUILD, 'compose/subs.srt'), srt)

// ------------------------------------------------------------------ filter graph
// Paths inside the graph are relative to demo/build/compose (ffmpeg runs there), which
// avoids escaping Windows drive colons.
const fade = (s, e) => `alpha='max(0,min(1,min((t-${s.toFixed(2)})/0.45,(${e.toFixed(2)}-t)/0.35)))'`
let graph = `[0:v]loop=loop=-1:size=1:start=0,trim=duration=${total.toFixed(2)},setpts=PTS-STARTPTS,format=rgba[bg];`
// Playwright records the page at its CSS size in the top-left of the frame; crop to it.
graph += `[1:v]crop=430:932:0:0,scale=${PHONE_W}:${PHONE_H}:flags=lanczos,format=rgba[ph];`
graph += `[2:v]loop=loop=-1:size=1:start=0,trim=duration=${total.toFixed(2)},setpts=PTS-STARTPTS,scale=${PHONE_W}:${PHONE_H},format=gray[mk];`
graph += `[ph][mk]alphamerge[phm];`
graph += `[bg][phm]overlay=${PHONE_X}:${PHONE_Y}:shortest=1[v0];`
let last = 'v0'
items.forEach((it, i) => {
  const en = `enable='between(t,${it.start.toFixed(2)},${it.end.toFixed(2)})'`
  const a = fade(it.start, it.end)
  const next = `v${i + 1}`
  graph +=
    `[${last}]` +
    `drawtext=fontfile=segoeuisl.ttf:textfile=num-${it.id}.txt:fontsize=24:fontcolor=0xE9B213:x=150:y=380:${a}:${en},` +
    `drawtext=fontfile=segoeuib.ttf:textfile=title-${it.id}.txt:fontsize=68:fontcolor=0xF4F6F8:x=150:y=420:${a}:${en},` +
    `drawtext=fontfile=segoeui.ttf:textfile=cap-${it.id}.txt:fontsize=34:line_spacing=16:fontcolor=0xC4CAD4:x=150:y=540:${a}:${en}` +
    `[${next}];`
  last = next
})
graph += `[${last}]format=yuv420p[vout];`
items.forEach((it, i) => {
  graph += `[${i + 3}:a]adelay=delays=${Math.round(it.start * 1000)}:all=1,aresample=48000[a${i}];`
})
graph += items.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${items.length}:normalize=0:duration=longest,apad,atrim=duration=${total.toFixed(2)}[aout]`
writeFileSync(path.join(BUILD, 'compose/graph.txt'), graph)

const args = [
  '-y', '-v', 'error', '-stats',
  '-i', 'bg.png',
  '-i', video,
  '-i', 'mask.png',
  ...items.flatMap((it) => ['-i', it.audio]),
  '-i', 'subs.srt',
  '-/filter_complex', 'graph.txt',
  '-map', '[vout]', '-map', '[aout]', '-map', `${items.length + 3}:s`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-r', '30',
  '-c:a', 'aac', '-b:a', '160k',
  '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng',
  '-movflags', '+faststart',
  path.join(ROOT, 'demo/PACT-demo.mp4'),
]
execFileSync('ffmpeg', args, { cwd: path.join(BUILD, 'compose'), stdio: 'inherit' })
console.log('wrote demo/PACT-demo.mp4 and demo/PACT-demo.srt')

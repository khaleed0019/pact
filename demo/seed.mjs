#!/usr/bin/env node
/**
 * Seed a LOCAL, in-memory PACT server with realistic sample data for the demo video.
 *
 *   node demo/seed.mjs http://localhost:3100
 *
 * Never point this at production. Everything here is invented: the brand "Lumen Studio"
 * and the contributor "@maya_edits" are freshly generated keys that exist only in this
 * server's memory, and the demo account is PACT's built-in sample account.
 */
import { ed25519 } from '@noble/curves/ed25519'
import { randomBytes } from 'node:crypto'

const BASE = process.argv[2] ?? 'http://localhost:3100'
const hex = (b) => Buffer.from(b).toString('hex')

function session() {
  let cookie = ''
  const call = async (path, method = 'GET', body) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const pair = c.split(';')[0]
      const name = pair.split('=')[0]
      cookie = [...cookie.split('; ').filter((x) => x && !x.startsWith(name + '=')), pair].join('; ')
    }
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`)
    return json
  }
  return { call }
}

async function wallet() {
  const s = session()
  const secret = randomBytes(32)
  const publicKey = ed25519.getPublicKey(secret)
  const challenge = await s.call('/api/auth/nonce', 'POST')
  await s.call('/api/auth/verify', 'POST', {
    publicKey: hex(publicKey),
    signature: hex(ed25519.sign(new TextEncoder().encode(challenge.message), secret)),
    nonce: challenge.nonce,
  })
  return s
}

// The built-in demo account gets a handle so a brand can invite it. Its role is left
// unset on purpose, so the video can show the first-run role choice.
const demo = session()
await demo.call('/api/auth/demo', 'POST')
await demo.call('/api/me/profile', 'PATCH', { handle: 'khaleed_demo', categories: ['VIDEO', 'DESIGN'] })

const maya = await wallet()
await maya.call('/api/me/role', 'PATCH', { role: 'CONTRIBUTOR' })
await maya.call('/api/me', 'PATCH', { displayName: 'Maya' })
await maya.call('/api/me/profile', 'PATCH', { handle: 'maya_edits', categories: ['VIDEO', 'SOCIAL'] })

const lumen = await wallet()
await lumen.call('/api/me/role', 'PATCH', { role: 'BRAND' })
const base = { ownerName: 'Lumen Studio', currency: 'NIM', chain: null, requirements: [], platform: '', submissionInstructions: '', revisionLimit: 2, invite: [] }

const campaigns = [
  {
    ...base,
    title: 'Design a launch banner set',
    brief: 'Three banners for our launch: one for X, one for LinkedIn and one for the website hero, in our brand colours.',
    requirements: ['Sizes for X, LinkedIn and web', 'Source files included'],
    category: 'DESIGN',
    rewardMinor: '4000000',
    slots: 3,
    deadline: '2026-11-08',
    submissionInstructions: 'Share a Figma or Drive link',
    visibility: 'PUBLIC',
  },
  {
    ...base,
    title: 'Cut three short clips from our launch stream',
    brief: 'Pick the three strongest moments from our 40 minute launch stream and cut them into vertical clips with captions.',
    requirements: ['Vertical 9:16', 'Burned-in captions'],
    category: 'VIDEO',
    platform: 'TikTok',
    rewardMinor: '2500000',
    slots: 4,
    deadline: '2026-11-05',
    submissionInstructions: 'Share a Drive folder link',
    visibility: 'PUBLIC',
  },
  {
    ...base,
    title: 'Translate our onboarding into Spanish',
    brief: 'Eight short onboarding screens, about 300 words in total. Keep the tone informal.',
    requirements: ['Native Spanish speaker'],
    category: 'WRITING',
    currency: 'USDT',
    chain: 'polygon',
    rewardMinor: '30000000',
    slots: 2,
    deadline: null,
    visibility: 'PUBLIC',
  },
  {
    ...base,
    title: 'Write a launch thread for X',
    brief: 'A six post thread explaining what we launched and why it matters, in plain language.',
    requirements: ['Six posts', 'No hashtags'],
    category: 'SOCIAL',
    platform: 'X',
    rewardMinor: '1500000',
    slots: 5,
    deadline: '2026-11-12',
    visibility: 'PUBLIC',
  },
  {
    ...base,
    title: 'Edit our 30 second product teaser',
    brief: 'We have raw footage of the app in use. Cut a 30 second teaser with music and captions for our launch.',
    requirements: ['30 seconds', 'Licensed music only'],
    category: 'VIDEO',
    platform: 'YouTube',
    rewardMinor: '6000000',
    slots: 1,
    deadline: '2026-11-10',
    submissionInstructions: 'Share an MP4 via a Drive link',
    visibility: 'PRIVATE',
    invite: [{ handle: 'khaleed_demo' }],
  },
]
for (const c of campaigns) {
  const r = await lumen.call('/api/campaigns', 'POST', c)
  console.log(`seeded ${c.visibility.toLowerCase()} campaign: ${r.campaign.title}`)
}
console.log('seed complete')

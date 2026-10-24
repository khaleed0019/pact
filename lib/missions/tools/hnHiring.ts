import type { Lead } from '../model.ts'

/**
 * The research tool: public Hacker News “Who is hiring?” posts.
 *
 * Chosen because it is real, public, keyless and checkable: every lead links to the post
 * it came from, so a reviewer can open any row and see that PACT did not make it up.
 * The HN Algolia API (https://hn.algolia.com/api) is read-only.
 *
 * Hard limits, independent of anything a plan says:
 *  - at most 1 + 5 requests (find the thread, then one search per keyword)
 *  - a 9 s timeout per request
 *  - top-level posts in that one thread only, at most 50 hits per keyword
 *  - nothing personal is extracted: no names, emails or phone numbers, even if a post has them
 */

const API = 'https://hn.algolia.com/api/v1'
const MAX_KEYWORDS = 5
const HITS_PER_KEYWORD = 50

export interface HnSearchResult {
  leads: Lead[]
  thread: { id: string; title: string; url: string }
  requestsMade: number
}

export class ToolError extends Error {}

interface Deps {
  fetch: typeof fetch
  timeoutMs?: number
}

async function getJson<T>(deps: Deps, url: string): Promise<T> {
  let response: Response
  try {
    response = await deps.fetch(url, { signal: AbortSignal.timeout(deps.timeoutMs ?? 9000), headers: { Accept: 'application/json' } })
  } catch {
    throw new ToolError('The Hacker News search API did not answer in time.')
  }
  if (!response.ok) throw new ToolError(`The Hacker News search API answered ${response.status}.`)
  try {
    return (await response.json()) as T
  } catch {
    throw new ToolError('The Hacker News search API sent something unreadable.')
  }
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#x2F;': '/', '&#39;': "'" }

export function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#x27|#x2F|#39);/g, (m) => ENTITIES[m] ?? m).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

/** HN comment HTML -> plain lines. */
export function toPlainLines(html: string): string[] {
  return decodeEntities(html.replace(/<p>/gi, '\n').replace(/<[^>]+>/g, ''))
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** First outbound link in the post that is not HN itself, as the company's site. */
export function firstWebsite(html: string): string | null {
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const url = decodeEntities(match[1])
    if (/^https?:\/\//i.test(url) && !/news\.ycombinator\.com/i.test(url)) return url
  }
  return null
}

const CLOSED = /\b(position(s)? (now )?closed|no longer hiring|role (has been )?filled|closed to applications)\b/i
const LOCATION = /\b(remote|onsite|on-site|hybrid|[A-Z][a-z]+,? ?(?:[A-Z]{2}|[A-Z][a-z]+))\b/

/**
 * “Company | Role | Location | …” is the thread's convention. Posts that don't follow it
 * are skipped rather than guessed at — a wrong company name is worse than a missing one.
 */
export function parsePost(html: string): { company: string; headline: string; location: string } | null {
  const lines = toPlainLines(html)
  const headline = lines[0] ?? ''
  if (!headline.includes('|')) return null
  const parts = headline.split('|').map((p) => p.trim()).filter(Boolean)
  const company = (parts[0] ?? '').replace(/\(.*?\)/g, '').trim()
  if (company.length < 2 || company.length > 60 || /^https?:/i.test(company)) return null
  const location = parts.slice(1).find((p) => LOCATION.test(p)) ?? ''
  return { company, headline: headline.slice(0, 200), location: location.slice(0, 80) }
}

interface Hit {
  objectID: string
  title?: string
  created_at: string
  comment_text?: string
  parent_id?: number
  story_id?: number
}

export async function searchHiringPosts(
  input: { keywords: string[]; limit: number },
  deps: Deps,
): Promise<HnSearchResult> {
  let requestsMade = 0
  const keywords = input.keywords.slice(0, MAX_KEYWORDS)

  const threads = await getJson<{ hits: Hit[] }>(deps, `${API}/search_by_date?tags=story,author_whoishiring&hitsPerPage=6`)
  requestsMade++
  const thread = threads.hits.find((h) => /^Ask HN: Who is hiring\?/i.test(h.title ?? ''))
  if (!thread) throw new ToolError('Could not find a current “Who is hiring?” thread.')
  const threadId = thread.objectID

  const byCompany = new Map<string, Lead>()
  for (const keyword of keywords) {
    const query = encodeURIComponent(keyword)
    const result = await getJson<{ hits: Hit[] }>(deps, `${API}/search?query=${query}&tags=comment,story_${threadId}&hitsPerPage=${HITS_PER_KEYWORD}`)
    requestsMade++
    for (const hit of result.hits) {
      // Top-level posts only: replies are conversations, not companies hiring.
      if (String(hit.parent_id ?? '') !== threadId || !hit.comment_text) continue
      if (CLOSED.test(hit.comment_text)) continue
      const parsed = parsePost(hit.comment_text)
      if (!parsed) continue
      const key = parsed.company.toLowerCase()
      const existing = byCompany.get(key)
      if (existing) {
        if (!existing.matchedKeywords.includes(keyword)) existing.matchedKeywords.push(keyword)
        continue
      }
      byCompany.set(key, {
        company: parsed.company,
        headline: parsed.headline,
        location: parsed.location,
        website: firstWebsite(hit.comment_text),
        sourceUrl: `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`,
        postedAt: hit.created_at,
        matchedKeywords: [keyword],
        note: '',
      })
    }
  }

  // Companies matching more of the terms first, then the most recent posts.
  const leads = [...byCompany.values()]
    .sort((a, b) => b.matchedKeywords.length - a.matchedKeywords.length || b.postedAt.localeCompare(a.postedAt))
    .slice(0, input.limit)
    .map((lead) => ({
      ...lead,
      note: `Hiring post mentions ${lead.matchedKeywords.map((k) => `“${k}”`).join(' and ')}${lead.location ? ` · ${lead.location}` : ''}.`,
    }))

  return {
    leads,
    thread: { id: threadId, title: thread.title ?? 'Ask HN: Who is hiring?', url: `https://news.ycombinator.com/item?id=${threadId}` },
    requestsMade,
  }
}

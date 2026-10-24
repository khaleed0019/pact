import type { AcceptanceResult, Lead } from './model.ts'

/**
 * Acceptance checks.
 *
 * Deterministic, and honest about their reach. A criterion PACT can measure from the
 * delivery itself (how many, how unique, whether each row has a source) gets MET or
 * NOT_MET with the evidence. A criterion it cannot measure is MANUAL — the person decides.
 * Nothing is marked MET because it sounds plausible.
 */

const CONTACT = /\b(e-?mails?|contact (person|name|details|info)|phone|named? contact|decision[- ]maker)\b/i
const FORMAT = /\b(csv|spreadsheet|google sheets?|sheet|table)\b/i
const COUNT = /\b(\d{1,3})\b/

export function checkAcceptance(input: { leads: Lead[]; targetCount: number; criteria: string[] }): AcceptanceResult[] {
  const { leads, targetCount } = input
  const companies = new Set(leads.map((l) => l.company.toLowerCase()))
  const withSource = leads.filter((l) => /^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/.test(l.sourceUrl)).length

  const results: AcceptanceResult[] = [
    {
      criterion: `At least ${targetCount} companies`,
      status: leads.length >= targetCount ? 'MET' : 'NOT_MET',
      basis: `Counted ${leads.length} in the delivery.`,
    },
    {
      criterion: 'No duplicate companies',
      status: companies.size === leads.length ? 'MET' : 'NOT_MET',
      basis: `${companies.size} distinct company names across ${leads.length} rows.`,
    },
    {
      criterion: 'Every row links to its public source',
      status: leads.length > 0 && withSource === leads.length ? 'MET' : 'NOT_MET',
      basis: `${withSource} of ${leads.length} rows link to the Hacker News post they came from.`,
    },
  ]

  for (const raw of input.criteria) {
    const criterion = raw.trim()
    if (!criterion) continue
    if (CONTACT.test(criterion)) {
      results.push({
        criterion,
        status: 'NOT_MET',
        basis: 'Not collected: PACT does not extract or guess personal contact details. Each row links to the public post instead.',
      })
    } else if (FORMAT.test(criterion)) {
      results.push({ criterion, status: 'MET', basis: 'The delivery is a table and downloads as CSV, which Google Sheets opens.' })
    } else if (COUNT.test(criterion) && /\b(unique|leads?|companies|customers|results)\b/i.test(criterion)) {
      const wanted = Number(criterion.match(COUNT)![1])
      results.push({
        criterion,
        status: companies.size >= wanted ? 'MET' : 'NOT_MET',
        basis: `Counted ${companies.size} distinct companies.`,
      })
    } else {
      results.push({ criterion, status: 'MANUAL', basis: 'PACT cannot measure this from the delivery. Your call.' })
    }
  }
  return results
}

/** CSV with every field quoted, so commas and quotes in a headline cannot shift columns. */
export function leadsToCsv(leads: Lead[]): string {
  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`
  // A leading = + - @ would be run as a formula by a spreadsheet; neutralise it.
  const safe = (v: string) => quote(/^[=+\-@]/.test(v) ? `'${v}` : v)
  const header = ['company', 'headline', 'location', 'website', 'source', 'posted_at', 'matched_keywords', 'note']
  const rows = leads.map((l) =>
    [l.company, l.headline, l.location, l.website ?? '', l.sourceUrl, l.postedAt, l.matchedKeywords.join('; '), l.note].map(safe).join(','),
  )
  return [header.join(','), ...rows].join('\n')
}

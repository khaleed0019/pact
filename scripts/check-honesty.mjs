#!/usr/bin/env node
/**
 * The honesty check.
 *
 * The Nimiq Mini Apps framework gives a Mini App no way to hold, freeze or conditionally
 * release funds. PACT therefore must never imply that it does — not in a heading, not in
 * a tooltip, not in a string someone adds in a hurry three weeks from now.
 *
 * Good intentions do not survive a deadline, so this runs in `npm run verify` and fails
 * the build if the forbidden vocabulary appears in any user-facing surface. It is the
 * cheapest possible guard against the one claim that would make this product dishonest.
 *
 * Run: node scripts/check-honesty.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()
const SCANNED = ['app', 'components']
const EXTENSIONS = new Set(['.ts', '.tsx'])

/**
 * Each rule is a phrase PACT cannot truthfully use, plus why.
 *
 * `allow` lists contexts where the word is legitimate — "escrow" inside a sentence that
 * explicitly denies escrow is exactly the disclosure we want, not a violation.
 */
const RULES = [
  {
    pattern: /\bescrow(ed|s)?\b/i,
    reason: 'PACT cannot hold funds — the framework has no escrow primitive.',
  },
  {
    pattern: /\bfunds? (are|is|will be) (held|locked|frozen)\b/i,
    reason: 'PACT never holds, locks or freezes anyone’s money.',
  },
  {
    pattern: /\b(release|releasing) (the )?(funds|payment|money)\b/i,
    reason: 'Nothing is held, so nothing can be released.',
  },
  {
    pattern: /\bwe (hold|keep|store) your (funds|money|crypto)\b/i,
    reason: 'PACT is not a custodian.',
  },
  {
    pattern: /\bguarantee[ds]? (payment|delivery|refund)\b/i,
    reason: 'PACT records agreements; it cannot guarantee either side performs.',
  },
  {
    pattern: /\blegal(ly)? (advice|binding|enforceable)\b/i,
    reason: 'PACT is not a law firm and must not claim legal effect.',
  },
  {
    pattern: /\brefund(able|s)?\b/i,
    reason: 'A direct wallet payment cannot be reversed by PACT.',
  },
]

/** Lines carrying this marker are a deliberate, reviewed exception. */
const EXEMPTION = 'honesty-check-ok'

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (EXTENSIONS.has(extname(entry))) out.push(full)
  }
  return out
}

const violations = []

for (const base of SCANNED) {
  let files
  try {
    files = walk(join(ROOT, base))
  } catch {
    continue // directory may not exist yet
  }

  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')

    lines.forEach((line, index) => {
      if (line.includes(EXEMPTION)) return

      for (const rule of RULES) {
        if (!rule.pattern.test(line)) continue

        /*
         * A negated mention is the disclosure, not the offence. "never holds your funds"
         * and "does not hold" are the sentences this product is supposed to contain, so
         * a nearby negation clears the line.
         */
        if (/\b(never|not|cannot|can't|no|does not|doesn't|isn't|is not)\b/i.test(line)) continue

        violations.push({
          file: relative(ROOT, file),
          line: index + 1,
          text: line.trim().slice(0, 120),
          reason: rule.reason,
        })
      }
    })
  }
}

if (violations.length > 0) {
  console.error('\n  Honesty check failed.\n')
  console.error('  PACT cannot hold funds, so it must not say that it does.\n')
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}`)
    console.error(`    ${violation.text}`)
    console.error(`    → ${violation.reason}\n`)
  }
  console.error(`  ${violations.length} problem${violations.length === 1 ? '' : 's'}.`)
  console.error(`  If a line is genuinely fine, add a "${EXEMPTION}" comment to it.\n`)
  process.exit(1)
}

console.log('  Honesty check passed — no unsupported custody or guarantee claims.')

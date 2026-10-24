import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import type { Mission } from './model.ts'

/**
 * The mission terms fingerprint.
 *
 * What the person approves is everything that bounds the agent: the brief, budget,
 * deadline, criteria, allowed tools and recipients, the provider and its price, and the
 * plan's keywords, size and steps. Those are serialised in a fixed order and hashed.
 *
 * Approval stores the fingerprint. Before every step and before any payment the current
 * terms are hashed again; a difference means the terms moved after approval, and nothing
 * proceeds until they are approved again.
 *
 * This is a tamper check inside PACT's own records. It is not a signature, not stored
 * on-chain, and is never described as either.
 */

const clean = (value: string): string => value.normalize('NFC').replace(/\s+/g, ' ').trim()

export function canonicalMissionTerms(mission: Pick<Mission, 'constraints' | 'provider' | 'plan'>): string {
  const { constraints: c, provider: p, plan } = mission
  // Arrays of [key, value] rather than an object, so key order can never depend on insertion.
  return JSON.stringify([
    ['v', 1],
    ['brief', clean(c.brief)],
    ['budgetYocto', c.budgetYocto],
    ['asset', c.asset],
    ['network', c.network],
    ['deadline', c.deadline],
    ['acceptanceCriteria', c.acceptanceCriteria.map(clean)],
    ['allowedTools', [...c.allowedTools].sort()],
    ['allowedRecipients', [...c.allowedRecipients].sort()],
    ['providerId', p.id],
    ['priceYocto', p.priceYocto],
    ['payoutAccount', p.payoutAccount ?? ''],
    ['keywords', plan.keywords.map((k) => clean(k).toLowerCase())],
    ['targetCount', plan.targetCount],
    ['steps', plan.steps.map((s) => [s.tool, clean(s.title)])],
  ])
}

export function missionFingerprint(mission: Pick<Mission, 'constraints' | 'provider' | 'plan'>): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalMissionTerms(mission))))
}

/** For display: the first 16 hex characters in groups of four. */
export function shortFingerprint(fingerprint: string): string {
  return fingerprint.slice(0, 16).replace(/(.{4})(?=.)/g, '$1 ')
}

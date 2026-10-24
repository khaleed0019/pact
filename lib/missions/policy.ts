import { LIMITS, isMissionTool, type Mission, type MissionConstraints, type MissionPlan, type PolicyCheck, type PolicyResult, type Provider } from './model.ts'
import { missionFingerprint } from './terms.ts'
import { compareYocto, formatNear } from '../near/amount.ts'

/**
 * The policy engine.
 *
 * Deterministic, synchronous and separate from the model on purpose. A language model's
 * plan is an untrusted proposal; this file decides whether it may proceed. Nothing here
 * calls a model, reads the network or depends on wording — so the same inputs always
 * give the same answer, and every answer carries the reason a person can read.
 *
 * Three gates, each run at the moment it matters rather than once up front:
 *
 *   evaluatePlan     when a plan is proposed or edited
 *   checkStep        immediately before each step executes
 *   checkPayment     immediately before a payment is prepared, and again before it is recorded
 */

const check = (id: string, label: string, passed: boolean, detail: string): PolicyCheck => ({ id, label, passed, detail })

export function evaluatePlan(
  plan: MissionPlan,
  constraints: MissionConstraints,
  provider: Provider,
  now: Date,
): PolicyResult {
  const today = now.toISOString().slice(0, 10)
  const disallowed = plan.steps.filter((s) => !isMissionTool(s.tool) || !constraints.allowedTools.includes(s.tool))
  const unsupported = plan.steps.filter((s) => isMissionTool(s.tool) && !provider.tools.includes(s.tool))

  const checks: PolicyCheck[] = [
    check(
      'tools',
      'Only allowed tools',
      disallowed.length === 0,
      disallowed.length === 0
        ? `Every step uses a tool you allowed (${constraints.allowedTools.join(', ')}).`
        : `Not allowed: ${[...new Set(disallowed.map((s) => s.tool))].join(', ')}. The agent may only use tools you allowed.`,
    ),
    check(
      'provider-tools',
      'Provider can run every step',
      unsupported.length === 0,
      unsupported.length === 0 ? `${provider.name} supports every step.` : `${provider.name} cannot run: ${unsupported.map((s) => s.tool).join(', ')}.`,
    ),
    check(
      'steps',
      'Bounded number of steps',
      plan.steps.length > 0 && plan.steps.length <= LIMITS.maxSteps,
      plan.steps.length === 0 ? 'The plan has no steps.' : `${plan.steps.length} of at most ${LIMITS.maxSteps} steps.`,
    ),
    check(
      'search-step',
      'Has a research step',
      plan.steps.some((s) => s.tool === 'hn_hiring_search'),
      plan.steps.some((s) => s.tool === 'hn_hiring_search') ? 'The plan gathers data before compiling it.' : 'Without a research step there is nothing to deliver.',
    ),
    check(
      'target',
      'Result size within limits',
      Number.isInteger(plan.targetCount) && plan.targetCount >= 1 && plan.targetCount <= LIMITS.maxTargetCount,
      `Asks for ${plan.targetCount} result(s); the limit is 1–${LIMITS.maxTargetCount}.`,
    ),
    check(
      'keywords',
      'Search terms present',
      plan.keywords.length >= 1 && plan.keywords.length <= LIMITS.maxKeywords,
      plan.keywords.length === 0 ? 'No search terms.' : `${plan.keywords.length} of at most ${LIMITS.maxKeywords} search terms.`,
    ),
    check(
      'budget',
      'Cost within budget',
      compareYocto(provider.priceYocto, constraints.budgetYocto) <= 0,
      `${provider.name} charges ${formatNear(provider.priceYocto)}; your budget is ${formatNear(constraints.budgetYocto)}.`,
    ),
    check(
      'deadline',
      'Deadline not passed',
      constraints.deadline >= today,
      constraints.deadline >= today ? `Due ${constraints.deadline}.` : `The deadline ${constraints.deadline} is already past.`,
    ),
    check(
      'recipient',
      'Payment recipient allowed',
      provider.payoutAccount !== null && constraints.allowedRecipients.includes(provider.payoutAccount),
      provider.payoutAccount === null
        ? 'This provider has no payout account configured, so no payment can be prepared.'
        : constraints.allowedRecipients.includes(provider.payoutAccount)
          ? `Payment may only go to ${provider.payoutAccount}.`
          : `${provider.payoutAccount} is not in your allowed recipients.`,
    ),
  ]

  return { allowed: checks.every((c) => c.passed), checks, checkedAt: now.toISOString() }
}

export type Gate = { ok: true } | { ok: false; reason: string; code: GateCode }
export type GateCode = 'STALE_TERMS' | 'NOT_APPROVED' | 'APPROVAL_EXPIRED' | 'TOOL_NOT_ALLOWED' | 'DEADLINE_PASSED' | 'WRONG_STATE' | 'RECIPIENT_NOT_ALLOWED' | 'OVER_BUDGET' | 'ALREADY_PAID' | 'WRONG_NETWORK'

const refuse = (code: GateCode, reason: string): Gate => ({ ok: false, code, reason })

/** The approval is real, current and unexpired, and the terms are the ones approved. */
function approvalHolds(mission: Mission, now: Date, enforceExpiry: boolean): Gate {
  if (!mission.approvedFingerprint || !mission.approvedAt) return refuse('NOT_APPROVED', 'This mission has not been approved.')
  if (missionFingerprint(mission) !== mission.approvedFingerprint) {
    return refuse('STALE_TERMS', 'The terms changed after you approved them. Review and approve again.')
  }
  if (enforceExpiry && mission.approvalExpiresAt && now.getTime() > Date.parse(mission.approvalExpiresAt)) {
    return refuse('APPROVAL_EXPIRED', 'Your approval expired before the work started. Approve again to run it.')
  }
  return { ok: true }
}

/** Run immediately before a step executes — not once per run. */
export function checkStep(mission: Mission, tool: string, now: Date, runStartedAt: Date): Gate {
  if (mission.status !== 'RUNNING') return refuse('WRONG_STATE', 'The mission is not running.')
  // Expiry is judged at the moment the run started: an approval valid then covers the whole run.
  const approval = approvalHolds(mission, runStartedAt, true)
  if (!approval.ok) return approval
  if (!isMissionTool(tool) || !mission.constraints.allowedTools.includes(tool) || !mission.provider.tools.includes(tool)) {
    return refuse('TOOL_NOT_ALLOWED', `The tool “${tool}” is not allowed for this mission.`)
  }
  if (mission.constraints.deadline < now.toISOString().slice(0, 10)) {
    return refuse('DEADLINE_PASSED', 'The deadline has passed.')
  }
  return { ok: true }
}

export function checkRunStart(mission: Mission, now: Date): Gate {
  if (mission.status !== 'APPROVED' && mission.status !== 'FAILED') {
    return refuse('WRONG_STATE', `A ${mission.status.toLowerCase()} mission cannot be started.`)
  }
  return approvalHolds(mission, now, true)
}

/** Before a payment is prepared, and again before one is recorded as submitted or confirmed. */
export function checkPayment(
  mission: Mission,
  payment: { recipient: string; amountYocto: string; asset: string; network: string },
  now: Date,
): Gate {
  if (mission.status !== 'ACCEPTED') return refuse('WRONG_STATE', 'Payment is only possible after you accept the delivery.')
  // The approval's start-by window does not apply to paying for accepted work.
  const approval = approvalHolds(mission, now, false)
  if (!approval.ok) return approval
  if (mission.payment.state === 'CONFIRMED') return refuse('ALREADY_PAID', 'This mission is already paid.')
  if (payment.asset !== mission.constraints.asset || payment.network !== mission.constraints.network) {
    return refuse('WRONG_NETWORK', `This mission only allows ${mission.constraints.asset} on ${mission.constraints.network}.`)
  }
  if (!mission.constraints.allowedRecipients.includes(payment.recipient) || payment.recipient !== mission.provider.payoutAccount) {
    return refuse('RECIPIENT_NOT_ALLOWED', `${payment.recipient} is not an allowed recipient for this mission.`)
  }
  if (payment.amountYocto !== mission.provider.priceYocto) {
    return refuse('OVER_BUDGET', 'The payment must be exactly the agreed price.')
  }
  if (compareYocto(payment.amountYocto, mission.constraints.budgetYocto) > 0) {
    return refuse('OVER_BUDGET', `${formatNear(payment.amountYocto)} is over the ${formatNear(mission.constraints.budgetYocto)} budget.`)
  }
  return { ok: true }
}

import { RepoError } from '../db/repo.ts'
import { nearToYocto, NearAmountError, formatNear } from '../near/amount.ts'
import { isNearTxHash, isTestnetAccountId, type NearConfig } from '../near/config.ts'
import { verifyNearTransfer } from '../near/verifyTransfer.ts'
import { checkAcceptance } from './acceptance.ts'
import { LIMITS, isMissionTool, type Lead, type Mission, type MissionDelivery, type MissionEvent, type MissionPlan, type MissionTool, type Provider, type StepRun } from './model.ts'
import { planMission, type AskForJson } from './planner.ts'
import { checkPayment, checkRunStart, checkStep, evaluatePlan } from './policy.ts'
import type { MissionStore } from './store.ts'
import { missionFingerprint } from './terms.ts'
import { searchHiringPosts, ToolError } from './tools/hnHiring.ts'

/**
 * Mission workflows. Every route goes through here; none touches the store directly.
 *
 * Authorisation is by owner address read from storage, never from the request. A
 * mission someone else owns answers NOT_FOUND, so its existence is not disclosed.
 *
 * Every state change is compare-and-set on the mission's version, and every decision —
 * including refusals — is written to the audit log with who made it.
 */

export interface MissionDeps {
  store: MissionStore
  now: () => Date
  fetch: typeof fetch
  ask: AskForJson | null
  aiBackend: string
  provider: Provider
  near: NearConfig
}

export interface CreateMissionInput {
  title: string
  brief: string
  budgetNear: string
  deadline: string
  acceptanceCriteria: string[]
  allowedTools: MissionTool[]
  /** The person ticked "allow payment to <provider account>". Without it no payment is possible. */
  allowProviderRecipient: boolean
}

type EventInput = Omit<MissionEvent, 'id' | 'at' | 'missionId'>

const log = (deps: MissionDeps, mission: Mission, event: EventInput) => deps.store.addEvent({ ...event, missionId: mission.id })

async function owned(deps: MissionDeps, id: string, actor: string): Promise<Mission> {
  const mission = await deps.store.get(id)
  if (!mission || mission.ownerAddress !== actor) throw new RepoError('NOT_FOUND', 'That mission does not exist.')
  return mission
}

const strip = (mission: Mission): Omit<Mission, 'version' | 'updatedAt'> => {
  const { version: _v, updatedAt: _u, ...rest } = mission
  return rest
}

const save = (deps: MissionDeps, mission: Mission, patch: Partial<Mission>) =>
  deps.store.update(mission.id, mission.version, { ...strip(mission), ...patch })

// --- create ------------------------------------------------------------------------------

export async function createMission(deps: MissionDeps, owner: string, input: CreateMissionInput): Promise<Mission> {
  const now = deps.now()
  let budgetYocto: string
  try {
    budgetYocto = nearToYocto(input.budgetNear)
  } catch (cause) {
    throw new RepoError('INVALID', cause instanceof NearAmountError ? cause.message : 'That budget is not a valid amount.')
  }
  const tools = input.allowedTools.filter(isMissionTool)
  const constraints = {
    brief: input.brief,
    budgetYocto,
    asset: 'NEAR' as const,
    network: 'testnet' as const,
    deadline: input.deadline,
    acceptanceCriteria: input.acceptanceCriteria,
    allowedTools: tools,
    allowedRecipients: input.allowProviderRecipient && deps.provider.payoutAccount ? [deps.provider.payoutAccount] : [],
  }

  const plan = await planMission(
    { brief: input.brief, acceptanceCriteria: input.acceptanceCriteria, today: now.toISOString().slice(0, 10) },
    deps.ask,
    deps.aiBackend,
  )
  const policy = evaluatePlan(plan, constraints, deps.provider, now)

  const mission = await deps.store.create({
    ownerAddress: owner,
    title: input.title,
    constraints,
    provider: deps.provider,
    plan,
    policy,
    status: policy.allowed ? 'PLANNED' : 'BLOCKED',
    approvedFingerprint: null,
    approvedAt: null,
    approvalExpiresAt: null,
    steps: [],
    delivery: null,
    payment: {
      state: 'NOT_STARTED',
      amountYocto: deps.provider.priceYocto,
      recipient: deps.provider.payoutAccount ?? '',
      payer: null,
      txHash: null,
      preparedAt: null,
      expiresAt: null,
      checkedAt: null,
      confirmedBlockTime: null,
      reason: null,
      explorerUrl: null,
    },
  })

  await log(deps, mission, {
    kind: 'MISSION_CREATED',
    actor: 'person',
    actorAddress: owner,
    summary: `Mission created with a ${formatNear(budgetYocto)} (testnet) budget, due ${input.deadline}.`,
    outcome: 'info',
    evidence: null,
  })
  await logPlan(deps, mission, plan, 'PLAN_PROPOSED')
  await logPolicy(deps, mission)
  return mission
}

async function logPlan(deps: MissionDeps, mission: Mission, plan: MissionPlan, kind: 'PLAN_PROPOSED' | 'PLAN_EDITED') {
  await log(deps, mission, {
    kind,
    actor: kind === 'PLAN_EDITED' ? 'person' : 'agent',
    actorAddress: kind === 'PLAN_EDITED' ? mission.ownerAddress : null,
    summary:
      kind === 'PLAN_EDITED'
        ? `Plan edited: ${plan.steps.length} steps, ${plan.targetCount} results, terms ${plan.keywords.join(', ')}.`
        : `Plan proposed by ${plan.source === 'model' ? `an AI model (${plan.backend})` : 'the built-in planner (no AI model configured)'}: ${plan.steps.length} steps.`,
    outcome: 'info',
    evidence: null,
  })
}

async function logPolicy(deps: MissionDeps, mission: Mission) {
  const failed = mission.policy.checks.filter((c) => !c.passed)
  await log(deps, mission, {
    kind: 'POLICY_CHECKED',
    actor: 'policy',
    actorAddress: null,
    summary: failed.length === 0 ? `All ${mission.policy.checks.length} policy checks passed.` : `Blocked: ${failed.map((c) => c.label.toLowerCase()).join('; ')}.`,
    outcome: failed.length === 0 ? 'ok' : 'blocked',
    evidence: null,
  })
}

// --- edit and approve --------------------------------------------------------------------

export async function editPlan(
  deps: MissionDeps,
  id: string,
  actor: string,
  edit: { keywords?: string[]; targetCount?: number; removeStepIds?: string[] },
): Promise<Mission> {
  const mission = await owned(deps, id, actor)
  if (!['PLANNED', 'BLOCKED', 'APPROVED'].includes(mission.status)) {
    throw new RepoError('CONFLICT', 'The plan can only be edited before the mission runs.')
  }
  const plan: MissionPlan = {
    ...mission.plan,
    keywords: edit.keywords ? [...new Set(edit.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))] : mission.plan.keywords,
    targetCount: edit.targetCount ?? mission.plan.targetCount,
    steps: mission.plan.steps.filter((s) => !(edit.removeStepIds ?? []).includes(s.id)),
  }
  const policy = evaluatePlan(plan, mission.constraints, mission.provider, deps.now())
  // Any edit voids an earlier approval: what was approved is no longer what would run.
  const saved = await save(deps, mission, {
    plan,
    policy,
    status: policy.allowed ? 'PLANNED' : 'BLOCKED',
    approvedFingerprint: null,
    approvedAt: null,
    approvalExpiresAt: null,
  })
  await logPlan(deps, saved, plan, 'PLAN_EDITED')
  await logPolicy(deps, saved)
  return saved
}

export async function approveMission(deps: MissionDeps, id: string, actor: string, fingerprintSeen: string): Promise<Mission> {
  const mission = await owned(deps, id, actor)
  const now = deps.now()
  const refuse = async (reason: string, kind: 'CONFLICT' | 'INVALID' = 'INVALID') => {
    await log(deps, mission, { kind: 'APPROVAL_REFUSED', actor: 'policy', actorAddress: null, summary: reason, outcome: 'blocked', evidence: null })
    throw new RepoError(kind, reason)
  }

  if (mission.status !== 'PLANNED') return refuse(`A mission that is ${mission.status.toLowerCase()} cannot be approved.`, 'CONFLICT')
  // You approve the terms you were shown, not whatever is stored by the time you tap.
  if (fingerprintSeen !== missionFingerprint(mission)) {
    return refuse('The terms changed since you loaded them. Review the current terms and approve again.', 'CONFLICT')
  }
  const policy = evaluatePlan(mission.plan, mission.constraints, mission.provider, now)
  if (!policy.allowed) return refuse(`Policy no longer passes: ${policy.checks.filter((c) => !c.passed).map((c) => c.detail).join(' ')}`)

  const saved = await save(deps, mission, {
    policy,
    status: 'APPROVED',
    approvedFingerprint: missionFingerprint(mission),
    approvedAt: now.toISOString(),
    approvalExpiresAt: new Date(now.getTime() + LIMITS.approvalTtlMs).toISOString(),
  })
  await log(deps, saved, {
    kind: 'AGREEMENT_APPROVED',
    actor: 'person',
    actorAddress: actor,
    summary: `Approved terms ${saved.approvedFingerprint!.slice(0, 16)}… — the agent may start within 24 hours.`,
    outcome: 'ok',
    evidence: null,
  })
  return saved
}

export async function cancelMission(deps: MissionDeps, id: string, actor: string): Promise<Mission> {
  const mission = await owned(deps, id, actor)
  if (!['PLANNED', 'BLOCKED', 'APPROVED', 'FAILED'].includes(mission.status)) {
    throw new RepoError('CONFLICT', `A ${mission.status.toLowerCase()} mission cannot be cancelled.`)
  }
  const saved = await save(deps, mission, { status: 'CANCELLED' })
  await log(deps, saved, { kind: 'MISSION_CANCELLED', actor: 'person', actorAddress: actor, summary: 'Mission cancelled.', outcome: 'info', evidence: null })
  return saved
}

// --- run ----------------------------------------------------------------------------------

export async function runMission(deps: MissionDeps, id: string, actor: string): Promise<Mission> {
  let mission = await owned(deps, id, actor)
  const runStartedAt = deps.now()
  const gate = checkRunStart(mission, runStartedAt)
  if (!gate.ok) {
    await log(deps, mission, { kind: 'STEP_BLOCKED', actor: 'policy', actorAddress: null, summary: gate.reason, outcome: 'blocked', evidence: null })
    throw new RepoError(gate.code === 'WRONG_STATE' ? 'CONFLICT' : 'INVALID', gate.reason)
  }

  const queued: StepRun[] = mission.plan.steps.map((s) => ({ stepId: s.id, state: 'QUEUED', startedAt: null, finishedAt: null, detail: '' }))
  // Compare-and-set: a second Run racing this one fails here with CONFLICT.
  mission = await save(deps, mission, { status: 'RUNNING', steps: queued, delivery: null })
  await log(deps, mission, { kind: 'RUN_STARTED', actor: 'person', actorAddress: actor, summary: 'Started the agent.', outcome: 'info', evidence: null })

  let leads: Lead[] = []
  let source: MissionDelivery['source'] | null = null
  let requestsMade = 0
  let acceptance: MissionDelivery['acceptance'] = []

  const setStep = async (stepId: string, patch: Partial<StepRun>, missionPatch: Partial<Mission> = {}) => {
    mission = await save(deps, mission, {
      ...missionPatch,
      steps: mission.steps.map((s) => (s.stepId === stepId ? { ...s, ...patch } : s)),
    })
  }
  const stopRemaining = (after: string): StepRun[] => {
    let past = false
    return mission.steps.map((s) => {
      if (s.stepId === after) {
        past = true
        return s
      }
      return past && s.state === 'QUEUED' ? { ...s, state: 'SKIPPED' } : s
    })
  }

  for (const step of mission.plan.steps) {
    // Re-read and re-check immediately before acting: terms could have been tampered with,
    // and the deadline can pass mid-run.
    const fresh = await deps.store.get(id)
    if (!fresh) throw new RepoError('NOT_FOUND', 'That mission does not exist.')
    mission = fresh
    const allowed = checkStep(mission, step.tool, deps.now(), runStartedAt)
    if (!allowed.ok) {
      await setStep(step.id, { state: 'BLOCKED', finishedAt: deps.now().toISOString(), detail: allowed.reason })
      mission = await save(deps, mission, { status: 'FAILED', steps: stopRemaining(step.id) })
      await log(deps, mission, { kind: 'STEP_BLOCKED', actor: 'policy', actorAddress: null, summary: `${step.title}: ${allowed.reason}`, outcome: 'blocked', evidence: null })
      return mission
    }

    await setStep(step.id, { state: 'RUNNING', startedAt: deps.now().toISOString() })
    await log(deps, mission, { kind: 'STEP_STARTED', actor: 'agent', actorAddress: null, summary: step.title, outcome: 'info', evidence: null })

    try {
      let detail = ''
      let evidence: MissionEvent['evidence'] = null
      if (step.tool === 'hn_hiring_search') {
        const result = await searchHiringPosts({ keywords: mission.plan.keywords, limit: mission.plan.targetCount }, { fetch: deps.fetch })
        leads = result.leads
        requestsMade += result.requestsMade
        source = { label: 'Hacker News “Who is hiring?” via the public HN Algolia API', url: result.thread.url, threadTitle: result.thread.title }
        detail = `${result.requestsMade} read-only requests; ${leads.length} matching companies in “${result.thread.title}”.`
        evidence = { label: result.thread.title, url: result.thread.url }
      } else if (step.tool === 'compile_leads') {
        detail = `${leads.length} rows, one per company, each linked to its source post.`
      } else if (step.tool === 'acceptance_check') {
        acceptance = checkAcceptance({ leads, targetCount: mission.plan.targetCount, criteria: mission.constraints.acceptanceCriteria })
        const met = acceptance.filter((a) => a.status === 'MET').length
        detail = `${met} of ${acceptance.length} criteria met; ${acceptance.filter((a) => a.status === 'MANUAL').length} need your judgement.`
      }
      await setStep(step.id, { state: 'DONE', finishedAt: deps.now().toISOString(), detail })
      await log(deps, mission, { kind: 'STEP_COMPLETED', actor: 'agent', actorAddress: null, summary: `${step.title} — ${detail}`, outcome: 'ok', evidence })
    } catch (cause) {
      const reason = cause instanceof ToolError ? cause.message : 'The step failed unexpectedly.'
      if (!(cause instanceof ToolError)) console.error('[pact] mission step failed', cause)
      await setStep(step.id, { state: 'FAILED', finishedAt: deps.now().toISOString(), detail: reason })
      mission = await save(deps, mission, { status: 'FAILED', steps: stopRemaining(step.id) })
      await log(deps, mission, { kind: 'STEP_FAILED', actor: 'agent', actorAddress: null, summary: `${step.title}: ${reason} You can retry while the approval holds.`, outcome: 'failed', evidence: null })
      return mission
    }
  }

  const limitations = [
    'Leads come only from companies that posted in the latest public Hacker News “Who is hiring?” thread.',
    'No contact names, emails or phone numbers are collected — each row links to the public post instead.',
    'A hiring post shows a company is investing in an area; it does not show they will buy.',
  ]
  if (!mission.plan.steps.some((s) => s.tool === 'acceptance_check')) limitations.push('The plan had no acceptance-check step, so nothing was checked automatically.')

  const delivery: MissionDelivery = {
    leads,
    source: source ?? { label: 'No source was read', url: '', threadTitle: '' },
    requestsMade,
    acceptance,
    producedAt: deps.now().toISOString(),
    limitations,
  }
  mission = await save(deps, mission, { status: 'DELIVERED', delivery })
  await log(deps, mission, {
    kind: 'DELIVERY_RECORDED',
    actor: 'agent',
    actorAddress: null,
    summary: `Delivered ${leads.length} companies for review.`,
    outcome: 'ok',
    evidence: source && source.url ? { label: 'Source thread', url: source.url } : null,
  })
  return mission
}

// --- review --------------------------------------------------------------------------------

export async function reviewDelivery(deps: MissionDeps, id: string, actor: string, decision: 'ACCEPT' | 'REJECT', note: string): Promise<Mission> {
  const mission = await owned(deps, id, actor)
  if (mission.status !== 'DELIVERED') throw new RepoError('CONFLICT', 'There is no delivery waiting for review.')
  const saved = await save(deps, mission, { status: decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED' })
  await log(deps, saved, {
    kind: decision === 'ACCEPT' ? 'DELIVERY_ACCEPTED' : 'DELIVERY_REJECTED',
    actor: 'person',
    actorAddress: actor,
    summary: `${decision === 'ACCEPT' ? 'Accepted' : 'Rejected'} the delivery${note.trim() ? `: “${note.trim().slice(0, 200)}”` : '.'}`,
    outcome: decision === 'ACCEPT' ? 'ok' : 'info',
    evidence: null,
  })
  return saved
}

// --- payment -------------------------------------------------------------------------------

function paymentRequest(mission: Mission) {
  return { recipient: mission.provider.payoutAccount ?? '', amountYocto: mission.provider.priceYocto, asset: 'NEAR', network: 'testnet' }
}

export async function preparePayment(deps: MissionDeps, id: string, actor: string): Promise<Mission> {
  const mission = await owned(deps, id, actor)
  const now = deps.now()
  const p = mission.payment
  if (p.state === 'SUBMITTED') throw new RepoError('CONFLICT', 'A payment is already submitted. Check its status instead.')
  if (p.state === 'AWAITING_SIGNATURE' && p.expiresAt && now.getTime() <= Date.parse(p.expiresAt)) return mission

  const gate = checkPayment(mission, paymentRequest(mission), now)
  if (!gate.ok) {
    await log(deps, mission, { kind: 'PAYMENT_REFUSED', actor: 'policy', actorAddress: null, summary: gate.reason, outcome: 'blocked', evidence: null })
    throw new RepoError(gate.code === 'ALREADY_PAID' || gate.code === 'WRONG_STATE' ? 'CONFLICT' : 'INVALID', gate.reason)
  }
  const saved = await save(deps, mission, {
    payment: {
      ...p,
      state: 'AWAITING_SIGNATURE',
      amountYocto: mission.provider.priceYocto,
      recipient: mission.provider.payoutAccount!,
      payer: null,
      txHash: null,
      preparedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + LIMITS.paymentIntentTtlMs).toISOString(),
      checkedAt: null,
      confirmedBlockTime: null,
      reason: null,
      explorerUrl: null,
    },
  })
  await log(deps, saved, {
    kind: 'PAYMENT_PREPARED',
    actor: 'policy',
    actorAddress: null,
    summary: `Policy passed. Waiting for ${formatNear(saved.payment.amountYocto)} on testnet to ${saved.payment.recipient}. Nothing has been sent.`,
    outcome: 'ok',
    evidence: null,
  })
  return saved
}

export async function submitPayment(deps: MissionDeps, id: string, actor: string, input: { txHash: string; payer: string }): Promise<Mission> {
  const mission = await owned(deps, id, actor)
  const now = deps.now()
  const p = mission.payment
  const txHash = input.txHash.trim()
  const payer = input.payer.trim().toLowerCase()

  if (p.state === 'CONFIRMED') throw new RepoError('CONFLICT', 'This mission is already paid.')
  if (p.state === 'NOT_STARTED' || !p.preparedAt) throw new RepoError('CONFLICT', 'Prepare the payment first.')
  if (p.state === 'AWAITING_SIGNATURE' && p.expiresAt && now.getTime() > Date.parse(p.expiresAt)) {
    throw new RepoError('CONFLICT', 'This payment request expired. Prepare it again — nothing was sent.')
  }
  if (!isNearTxHash(txHash)) throw new RepoError('INVALID', 'That is not a NEAR transaction hash.')
  if (!isTestnetAccountId(payer)) throw new RepoError('INVALID', 'Enter the NEAR testnet account you paid from, like alice.testnet.')

  const reused = await deps.store.findByTxHash(txHash)
  if (reused && reused.id !== mission.id) throw new RepoError('CONFLICT', 'That transaction is already recorded against another mission.')

  // Policy again, immediately before anything is recorded.
  const gate = checkPayment(mission, paymentRequest(mission), now)
  if (!gate.ok) {
    await log(deps, mission, { kind: 'PAYMENT_REFUSED', actor: 'policy', actorAddress: null, summary: gate.reason, outcome: 'blocked', evidence: null })
    throw new RepoError('INVALID', gate.reason)
  }

  const outcome = await verifyNearTransfer(
    txHash,
    { signerId: payer, receiverId: p.recipient, amountYocto: p.amountYocto, notBeforeMs: Date.parse(p.preparedAt) },
    { fetch: deps.fetch, config: deps.near },
  )

  const base = { ...p, payer, txHash, checkedAt: now.toISOString() }
  if (outcome.state === 'CONFIRMED') {
    const explorerUrl = deps.near.explorerTxUrl(outcome.txHash)
    const saved = await save(deps, mission, {
      payment: { ...base, state: 'CONFIRMED', reason: null, confirmedBlockTime: new Date(outcome.blockTimestampMs).toISOString(), explorerUrl },
    })
    await log(deps, saved, {
      kind: 'PAYMENT_CONFIRMED',
      actor: 'network',
      actorAddress: null,
      summary: `NEAR testnet shows ${formatNear(p.amountYocto)} from ${payer} to ${p.recipient}, final.`,
      outcome: 'ok',
      evidence: { label: 'View on NearBlocks (testnet)', url: explorerUrl },
    })
    return saved
  }
  if (outcome.state === 'PENDING') {
    const saved = await save(deps, mission, { payment: { ...base, state: 'SUBMITTED', reason: outcome.reason, explorerUrl: null } })
    await log(deps, saved, { kind: 'PAYMENT_SUBMITTED', actor: 'person', actorAddress: actor, summary: `Transaction submitted for checking — not confirmed: ${outcome.reason}`, outcome: 'info', evidence: null })
    return saved
  }
  const saved = await save(deps, mission, { payment: { ...base, state: 'FAILED', reason: outcome.reason, explorerUrl: null } })
  await log(deps, saved, { kind: 'PAYMENT_FAILED', actor: 'network', actorAddress: null, summary: outcome.reason, outcome: 'failed', evidence: null })
  return saved
}

// --- read -----------------------------------------------------------------------------------

export async function missionView(deps: MissionDeps, id: string, actor: string) {
  const mission = await owned(deps, id, actor)
  const fingerprint = missionFingerprint(mission)
  return {
    mission,
    events: await deps.store.listEvents(id),
    fingerprint,
    termsChangedSinceApproval: mission.approvedFingerprint !== null && mission.approvedFingerprint !== fingerprint,
  }
}

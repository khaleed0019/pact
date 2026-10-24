/**
 * Missions: a bounded job handed to an agent, with a budget and rules.
 *
 * The shape follows one principle: **the AI proposes, the policy decides, the person
 * approves.** Constraints (budget, deadline, recipient, allowed tools) are typed in by the
 * person and never come from a model. The plan is a model's *proposal*; it is validated
 * by `policy.ts`, frozen by `terms.ts` when approved, and every step is checked again
 * immediately before it runs.
 */

// --- tools -----------------------------------------------------------------------------

/**
 * Everything an agent can do. Not a plugin system: a closed list, each entry a function
 * in `tools/` with hard limits. A plan naming anything else is refused, not ignored.
 */
export const MISSION_TOOLS = ['hn_hiring_search', 'compile_leads', 'acceptance_check'] as const
export type MissionTool = (typeof MISSION_TOOLS)[number]

export const TOOL_INFO: Record<MissionTool, { label: string; description: string; external: boolean }> = {
  hn_hiring_search: {
    label: 'Search public hiring posts',
    description:
      'Reads the latest Hacker News “Who is hiring?” thread through the public HN Algolia API and keeps posts that mention your keywords. Read-only, no account, no personal data collected.',
    external: true,
  },
  compile_leads: {
    label: 'Compile the lead list',
    description: 'De-duplicates companies and builds the table and CSV from what the search actually returned.',
    external: false,
  },
  acceptance_check: {
    label: 'Check against acceptance criteria',
    description: 'Deterministic checks of the delivery against what was agreed, with the basis for each result.',
    external: false,
  },
}

export function isMissionTool(value: string): value is MissionTool {
  return (MISSION_TOOLS as readonly string[]).includes(value)
}

/** Hard limits that no plan, edit or model output can move. */
export const LIMITS = {
  maxTargetCount: 20,
  maxKeywords: 5,
  maxSteps: 6,
  /** An approval must be acted on within this window, or it has to be given again. */
  approvalTtlMs: 24 * 60 * 60 * 1000,
  /** A prepared payment must be signed within this window before a new one is needed. */
  paymentIntentTtlMs: 30 * 60 * 1000,
} as const

// --- provider ---------------------------------------------------------------------------

/**
 * Who does the work and gets paid. One provider today, operated by this PACT deployment;
 * its price is fixed by configuration, never by a model.
 */
export interface Provider {
  id: string
  name: string
  operator: string
  tools: MissionTool[]
  /** yoctoNEAR. */
  priceYocto: string
  /** NEAR testnet account that receives payment; null when not configured. */
  payoutAccount: string | null
}

// --- constraints and plan --------------------------------------------------------------

export interface MissionConstraints {
  brief: string
  /** The most this mission may cost, in yoctoNEAR. */
  budgetYocto: string
  asset: 'NEAR'
  network: 'testnet'
  /** YYYY-MM-DD. */
  deadline: string
  acceptanceCriteria: string[]
  allowedTools: MissionTool[]
  /** Accounts a payment for this mission may go to. Chosen by the person. */
  allowedRecipients: string[]
}

export interface PlanStep {
  id: string
  /** As proposed. A string, so a disallowed tool can be reported rather than silently dropped. */
  tool: string
  title: string
  rationale: string
}

export interface MissionPlan {
  summary: string
  keywords: string[]
  targetCount: number
  steps: PlanStep[]
  risks: string[]
  /** Who wrote the plan — shown to the person, never used to skip a check. */
  source: 'model' | 'heuristic'
  backend: string | null
}

// --- policy ----------------------------------------------------------------------------

export interface PolicyCheck {
  id: string
  label: string
  passed: boolean
  detail: string
}

export interface PolicyResult {
  allowed: boolean
  checks: PolicyCheck[]
  checkedAt: string
}

// --- execution and delivery ------------------------------------------------------------

export type StepState = 'QUEUED' | 'RUNNING' | 'DONE' | 'BLOCKED' | 'FAILED' | 'SKIPPED'

export interface StepRun {
  stepId: string
  state: StepState
  startedAt: string | null
  finishedAt: string | null
  detail: string
}

export interface Lead {
  company: string
  headline: string
  location: string
  website: string | null
  /** Link to the public post this lead came from. Always present: no source, no lead. */
  sourceUrl: string
  postedAt: string
  matchedKeywords: string[]
  note: string
}

export interface AcceptanceResult {
  criterion: string
  /** MET / NOT_MET are deterministic; MANUAL means a person has to judge it. */
  status: 'MET' | 'NOT_MET' | 'MANUAL'
  basis: string
}

export interface MissionDelivery {
  leads: Lead[]
  source: { label: string; url: string; threadTitle: string }
  requestsMade: number
  acceptance: AcceptanceResult[]
  producedAt: string
  limitations: string[]
}

// --- payment ---------------------------------------------------------------------------

/**
 * Each state means exactly one thing:
 *   NOT_STARTED         nothing prepared
 *   AWAITING_SIGNATURE  policy passed and instructions shown; nothing has been sent
 *   SUBMITTED           a hash was given and the network has not confirmed it yet
 *   CONFIRMED           read off NEAR testnet and matched (see lib/near/verifyTransfer.ts)
 *   FAILED              the network shows something, and it is not this payment
 */
export type PaymentState = 'NOT_STARTED' | 'AWAITING_SIGNATURE' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED'

export interface MissionPayment {
  state: PaymentState
  amountYocto: string
  recipient: string
  payer: string | null
  txHash: string | null
  preparedAt: string | null
  expiresAt: string | null
  checkedAt: string | null
  confirmedBlockTime: string | null
  reason: string | null
  explorerUrl: string | null
}

// --- the mission ------------------------------------------------------------------------

export type MissionStatus =
  | 'PLANNED' // plan proposed and passed policy; waiting for approval
  | 'BLOCKED' // plan proposed and failed policy; must be edited
  | 'APPROVED' // agreement approved; terms frozen by fingerprint
  | 'RUNNING'
  | 'DELIVERED' // agent finished; waiting for the person to accept or reject
  | 'ACCEPTED'
  | 'REJECTED'
  | 'FAILED' // a step failed; may be retried while the approval holds
  | 'CANCELLED'

export interface Mission {
  id: string
  ownerAddress: string
  title: string
  constraints: MissionConstraints
  provider: Provider
  plan: MissionPlan
  policy: PolicyResult
  status: MissionStatus
  /** Fingerprint of the terms when approved. Any later difference means stale terms. */
  approvedFingerprint: string | null
  approvedAt: string | null
  approvalExpiresAt: string | null
  steps: StepRun[]
  delivery: MissionDelivery | null
  payment: MissionPayment
  /** Bumped on every write; updates are compare-and-set on it. */
  version: number
  createdAt: string
  updatedAt: string
}

// --- audit log -------------------------------------------------------------------------

export type MissionEventKind =
  | 'MISSION_CREATED'
  | 'PLAN_PROPOSED'
  | 'PLAN_EDITED'
  | 'POLICY_CHECKED'
  | 'AGREEMENT_APPROVED'
  | 'APPROVAL_REFUSED'
  | 'RUN_STARTED'
  | 'STEP_STARTED'
  | 'STEP_COMPLETED'
  | 'STEP_BLOCKED'
  | 'STEP_FAILED'
  | 'DELIVERY_RECORDED'
  | 'DELIVERY_ACCEPTED'
  | 'DELIVERY_REJECTED'
  | 'PAYMENT_PREPARED'
  | 'PAYMENT_REFUSED'
  | 'PAYMENT_SUBMITTED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'MISSION_CANCELLED'

export interface MissionEvent {
  id: string
  missionId: string
  at: string
  kind: MissionEventKind
  actor: 'person' | 'agent' | 'policy' | 'network'
  actorAddress: string | null
  summary: string
  outcome: 'ok' | 'blocked' | 'failed' | 'info'
  evidence: { label: string; url: string } | null
}

export const STATUS_LABEL: Record<MissionStatus, { label: string; tone: 'neutral' | 'gold' | 'azure' | 'jade' | 'amber' | 'rose' }> = {
  PLANNED: { label: 'Awaiting approval', tone: 'gold' },
  BLOCKED: { label: 'Blocked by policy', tone: 'rose' },
  APPROVED: { label: 'Approved', tone: 'azure' },
  RUNNING: { label: 'Running', tone: 'azure' },
  DELIVERED: { label: 'Delivered — review', tone: 'gold' },
  ACCEPTED: { label: 'Accepted', tone: 'jade' },
  REJECTED: { label: 'Rejected', tone: 'rose' },
  FAILED: { label: 'Failed', tone: 'rose' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
}

export const PAYMENT_LABEL: Record<PaymentState, string> = {
  NOT_STARTED: 'Not paid',
  AWAITING_SIGNATURE: 'Awaiting your transfer',
  SUBMITTED: 'Submitted — not confirmed',
  CONFIRMED: 'Confirmed on NEAR testnet',
  FAILED: 'Not accepted',
}

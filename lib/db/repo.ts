import type {
  Activity,
  ActivityKind,
  Currency,
  Deliverable,
  Dispute,
  DisputeReason,
  DisputeStatus,
  EvmChainKey,
  Invitation,
  Milestone,
  Negotiation,
  NegotiationChange,
  Notification,
  Pact,
  PactDetail,
  PactStatus,
  Participant,
  ParticipantRole,
  Payment,
  PaymentStatus,
  TrustMetrics,
} from '../pact/types.ts'

/**
 * The storage contract.
 *
 * Two implementations satisfy it: an in-process store (zero configuration, seeded with
 * the demo scenarios, so `npm run dev` on a fresh clone is already a working product)
 * and Supabase Postgres for deployment. Route handlers only ever see this interface, so
 * neither one can leak assumptions into the rest of the app.
 *
 * Every method that changes a pact takes the acting address. Authorisation is decided
 * inside the repository against stored participants, never from anything the client sent.
 */

export interface CreatePactInput {
  createdBy: string
  creatorRole: ParticipantRole
  creatorName: string
  counterpartyName: string
  counterpartyAddress: string | null
  title: string
  deliverable: string
  currency: Currency
  chain: EvmChainKey | null
  totalAmountMinor: string
  deadline: string | null
  paymentCondition: string
  specialTerms: string[]
  milestones: Array<{ title: string; description: string; amountMinor: string; percent: number; dueDate: string | null }>
}

export interface UpdateTermsInput {
  title?: string
  deliverable?: string
  totalAmountMinor?: string
  deadline?: string | null
  paymentCondition?: string
  specialTerms?: string[]
  milestones?: Array<{ title: string; description: string; amountMinor: string; percent: number; dueDate: string | null }>
}

export interface RecordPaymentInput {
  pactId: string
  milestoneId: string | null
  fromAddress: string
  toAddress: string
  amountMinor: string
  currency: Currency
  chain: EvmChainKey | null
  memo: string | null
  idempotencyKey: string
}

export interface Repository {
  // --- pacts ------------------------------------------------------------------------
  createPact(input: CreatePactInput): Promise<PactDetail>
  getPactById(id: string): Promise<PactDetail | null>
  getPactByShortId(shortId: string): Promise<PactDetail | null>
  listPactsForAddress(address: string): Promise<Pact[]>
  updateTerms(pactId: string, actor: string, patch: UpdateTermsInput): Promise<PactDetail>
  setStatus(pactId: string, actor: string, status: PactStatus): Promise<PactDetail>

  // --- participants and sealing -----------------------------------------------------
  joinPact(pactId: string, address: string, displayName: string): Promise<PactDetail>
  /**
   * Record the caller's EVM address on their participant row.
   *
   * A Nimiq address cannot receive USDT — that settles on an EVM chain against a
   * different address. Nimiq Pay gives each user one EVM address across all supported
   * chains, so it is captured once, from the wallet, and stored against the party it
   * belongs to.
   */
  setEvmAddress(pactId: string, address: string, evmAddress: string): Promise<PactDetail>

  recordSeal(input: {
    pactId: string
    address: string
    signature: string
    publicKey: string
  }): Promise<PactDetail>

  // --- lifecycle --------------------------------------------------------------------
  recordPayment(input: RecordPaymentInput): Promise<Payment>
  updatePaymentStatus(input: {
    paymentId: string
    status: PaymentStatus
    txReference?: string | null
    failureReason?: string | null
  }): Promise<Payment>
  findPaymentByIdempotencyKey(key: string): Promise<Payment | null>
  /** Needed so routes can authorise a payment update *before* performing it. */
  getPaymentById(id: string): Promise<Payment | null>

  setMilestoneStatus(pactId: string, milestoneId: string, status: Milestone['status']): Promise<Milestone>

  submitDeliverable(input: {
    pactId: string
    milestoneId: string | null
    submittedBy: string
    note: string
    link: string | null
  }): Promise<Deliverable>
  reviewDeliverable(input: {
    deliverableId: string
    actor: string
    status: Deliverable['status']
    reviewNote: string | null
  }): Promise<Deliverable>

  // --- negotiation ------------------------------------------------------------------
  openNegotiation(input: {
    pactId: string
    proposedBy: string
    message: string
    changes: Array<Omit<NegotiationChange, 'id' | 'negotiationId'>>
  }): Promise<Negotiation>
  resolveNegotiation(input: {
    negotiationId: string
    actor: string
    status: Negotiation['status']
  }): Promise<Negotiation>

  // --- disputes ---------------------------------------------------------------------
  /**
   * Flag a problem. One open dispute per agreement, enforced in storage rather than by
   * the caller, so two people hitting the button at once can't produce two.
   */
  raiseDispute(input: {
    pactId: string
    raisedBy: string
    reason: DisputeReason
    detail: string
  }): Promise<Dispute>
  /**
   * Close one out. `RESOLVED` means the two of them worked it out; `WITHDRAWN` means the
   * person who raised it took it back. PACT does not adjudicate, so there is deliberately
   * no "upheld" or "rejected" — neither would be a thing this app could honestly decide.
   */
  resolveDispute(input: {
    disputeId: string
    actor: string
    status: Exclude<DisputeStatus, 'OPEN'>
  }): Promise<Dispute>

  // --- supporting records -----------------------------------------------------------
  addActivity(input: {
    pactId: string
    kind: ActivityKind
    actorAddress: string | null
    actorName: string
    summary: string
    meta?: Record<string, string | number | null>
  }): Promise<Activity>

  createInvitation(input: { pactId: string; role: ParticipantRole; createdBy: string }): Promise<Invitation>
  getInvitationByToken(token: string): Promise<Invitation | null>
  acceptInvitation(token: string, address: string): Promise<Invitation>

  /** Set the display name shown to counterparties on every future pact, and on the trust profile. */
  updateProfile(address: string, displayName: string): Promise<void>

  getTrustMetrics(address: string): Promise<TrustMetrics>
  listNotifications(address: string): Promise<Notification[]>
  markNotificationRead(id: string, address: string): Promise<void>

  /** Recompute due/overdue nudges for one user. Deduplicates against what was already sent. */
  refreshNotifications(address: string): Promise<Notification[]>
}

export type RepoErrorKind = 'NOT_FOUND' | 'NOT_ALLOWED' | 'CONFLICT' | 'INVALID'

/** Thrown by repositories for conditions the API layer maps onto HTTP status codes. */
export class RepoError extends Error {
  /**
   * A structural marker, checked instead of `instanceof`.
   *
   * This module is reachable by more than one specifier (`@/lib/db` re-exports it, and
   * the repositories import `./repo.ts` directly). A bundler is entitled to instantiate
   * it twice, which produces two distinct classes and makes `instanceof` quietly false —
   * so every 403, 404 and 409 was being reported to users as a generic 500. Checking a
   * property cannot fail that way.
   */
  readonly isRepoError = true as const
  readonly kind: RepoErrorKind

  constructor(kind: RepoErrorKind, message: string) {
    super(message)
    this.name = 'RepoError'
    this.kind = kind
  }
}

/** Type guard that survives duplicate module instances. Always use this. */
export function isRepoError(cause: unknown): cause is RepoError {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { isRepoError?: unknown }).isRepoError === true &&
    typeof (cause as { kind?: unknown }).kind === 'string'
  )
}

export type { Activity, Deliverable, Dispute, Invitation, Milestone, Negotiation, Notification, Pact, PactDetail, Participant, Payment, TrustMetrics }

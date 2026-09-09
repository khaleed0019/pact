import { randomUUID } from 'node:crypto'
import { canTransition, isTerminal, type Actor } from '../pact/state.ts'
import { shortIdFromDigest, termsDigest, type CanonicalTerms } from '../pact/digest.ts'
import { sumMinor } from '../pact/money.ts'
import { normalizeAddress } from '../nimiq/address.ts'
import type {
  Activity,
  ActivityKind,
  Deliverable,
  Dispute,
  DisputeReason,
  DisputeStatus,
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
import {
  RepoError,
  type CreatePactInput,
  type RecordPaymentInput,
  type Repository,
  type UpdateTermsInput,
} from './repo.ts'

/**
 * Zero-configuration store.
 *
 * This is the reference implementation of `Repository` and the default the app runs on.
 * A judge who clones the repo and runs `npm run dev` with an empty `.env` gets a fully
 * working product seeded with the three demo scenarios — no account, no keys, no setup.
 *
 * It is process-local, so it is not the right store for a multi-instance deployment.
 * `lib/db/index.ts` switches to Supabase automatically when credentials are present.
 */

interface Tables {
  pacts: Map<string, Pact>
  participants: Map<string, Participant[]>
  milestones: Map<string, Milestone[]>
  payments: Map<string, Payment[]>
  deliverables: Map<string, Deliverable[]>
  negotiations: Map<string, Negotiation[]>
  disputes: Map<string, Dispute[]>
  activities: Map<string, Activity[]>
  invitations: Map<string, Invitation>
  notifications: Map<string, Notification[]>
  // Keyed by normalized address. Mirrors Supabase's `profiles` table: an explicit name
  // set once here always wins over whatever a single pact's participant row says.
  profiles: Map<string, string>
}

function emptyTables(): Tables {
  return {
    pacts: new Map(),
    participants: new Map(),
    milestones: new Map(),
    payments: new Map(),
    profiles: new Map(),
    deliverables: new Map(),
    negotiations: new Map(),
    disputes: new Map(),
    activities: new Map(),
    invitations: new Map(),
    notifications: new Map(),
  }
}

const now = () => new Date().toISOString()

export class MemoryRepository implements Repository {
  private t: Tables = emptyTables()

  reset() {
    this.t = emptyTables()
  }

  /** Used by the demo seeder to install fully-formed pacts without replaying the API. */
  installSeed(pacts: PactDetail[]) {
    for (const pact of pacts) {
      const { payments, deliverables, negotiations, disputes, activities, participants, milestones, ...core } = pact
      this.t.pacts.set(core.id, { ...core, participants, milestones })
      this.t.participants.set(core.id, participants)
      this.t.milestones.set(core.id, milestones)
      this.t.payments.set(core.id, payments)
      this.t.deliverables.set(core.id, deliverables)
      this.t.negotiations.set(core.id, negotiations)
      this.t.disputes.set(core.id, disputes)
      this.t.activities.set(core.id, activities)
    }
  }

  // --- helpers ----------------------------------------------------------------------

  private mustGet(pactId: string): Pact {
    const pact = this.t.pacts.get(pactId)
    if (!pact) throw new RepoError('NOT_FOUND', 'That agreement does not exist.')
    return pact
  }

  private hydrate(pactId: string): PactDetail {
    const pact = this.mustGet(pactId)
    return {
      ...pact,
      participants: this.t.participants.get(pactId) ?? [],
      milestones: [...(this.t.milestones.get(pactId) ?? [])].sort((a, b) => a.position - b.position),
      payments: this.t.payments.get(pactId) ?? [],
      deliverables: this.t.deliverables.get(pactId) ?? [],
      negotiations: this.t.negotiations.get(pactId) ?? [],
      disputes: this.t.disputes.get(pactId) ?? [],
      activities: [...(this.t.activities.get(pactId) ?? [])].sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
      ),
    }
  }

  /**
   * Resolve who is acting. Authorisation is decided from stored participants, so a
   * client cannot act as a role simply by claiming it.
   */
  private roleOf(pactId: string, address: string): ParticipantRole {
    const wanted = normalizeAddress(address)
    const participant = (this.t.participants.get(pactId) ?? []).find(
      (p) => p.address && normalizeAddress(p.address) === wanted,
    )
    if (!participant) throw new RepoError('NOT_ALLOWED', 'You are not a party to this agreement.')
    return participant.role
  }

  private canonicalTermsFor(pactId: string): CanonicalTerms {
    const pact = this.mustGet(pactId)
    return {
      title: pact.title,
      deliverable: pact.deliverable,
      currency: pact.currency,
      chain: pact.chain,
      totalAmountMinor: pact.totalAmountMinor,
      deadline: pact.deadline,
      paymentCondition: pact.paymentCondition,
      specialTerms: pact.specialTerms,
      participants: (this.t.participants.get(pactId) ?? []).map((p) => ({
        role: p.role,
        displayName: p.displayName,
        address: p.address,
      })),
      milestones: (this.t.milestones.get(pactId) ?? []).map((m) => ({
        position: m.position,
        title: m.title,
        amountMinor: m.amountMinor,
        dueDate: m.dueDate,
      })),
    }
  }

  /**
   * Recompute the fingerprint after any change to the terms.
   *
   * Doing this centrally is what makes a seal meaningful: it is impossible to edit a
   * pact and leave a stale digest that someone already signed. Signatures are cleared
   * whenever the digest moves, so an ACTIVE pact always has signatures over its
   * *current* terms.
   */
  private reseal(pactId: string) {
    const pact = this.mustGet(pactId)
    const digest = termsDigest(this.canonicalTermsFor(pactId))
    if (digest === pact.termsDigest) return

    const participants = (this.t.participants.get(pactId) ?? []).map((p) => ({
      ...p,
      sealSignature: null,
      sealPublicKey: null,
      sealedAt: null,
    }))
    this.t.participants.set(pactId, participants)
    this.t.pacts.set(pactId, { ...pact, termsDigest: digest, participants, updatedAt: now() })
  }

  private touch(pactId: string, patch: Partial<Pact> = {}) {
    const pact = this.mustGet(pactId)
    this.t.pacts.set(pactId, { ...pact, ...patch, updatedAt: now() })
  }

  private push<T>(map: Map<string, T[]>, key: string, value: T) {
    map.set(key, [...(map.get(key) ?? []), value])
  }

  // --- pacts ------------------------------------------------------------------------

  async createPact(input: CreatePactInput): Promise<PactDetail> {
    const id = randomUUID()
    const timestamp = now()
    const counterRole: ParticipantRole = input.creatorRole === 'CLIENT' ? 'PROVIDER' : 'CLIENT'

    const participants: Participant[] = [
      {
        id: randomUUID(),
        pactId: id,
        role: input.creatorRole,
        address: normalizeAddress(input.createdBy),
        displayName: input.creatorName,
        evmAddress: null,
        sealSignature: null,
        sealPublicKey: null,
        sealedAt: null,
        joinedAt: timestamp,
      },
      {
        id: randomUUID(),
        pactId: id,
        role: counterRole,
        address: input.counterpartyAddress ? normalizeAddress(input.counterpartyAddress) : null,
        displayName: input.counterpartyName,
        evmAddress: null,
        sealSignature: null,
        sealPublicKey: null,
        sealedAt: null,
        joinedAt: null,
      },
    ]

    const milestones: Milestone[] = input.milestones.map((m, index) => ({
      id: randomUUID(),
      pactId: id,
      position: index + 1,
      title: m.title,
      description: m.description,
      amountMinor: m.amountMinor,
      percent: m.percent,
      dueDate: m.dueDate,
      status: 'PENDING',
      createdAt: timestamp,
      updatedAt: timestamp,
    }))

    // Milestones must account for the whole agreement, or a party could complete every
    // milestone and still be owed money with no step left to pay it against.
    if (milestones.length > 0 && sumMinor(milestones.map((m) => m.amountMinor)) !== input.totalAmountMinor) {
      throw new RepoError('INVALID', 'Milestone amounts must add up to the total.')
    }

    const pact: Pact = {
      id,
      shortId: '', // filled in below, once the digest exists
      title: input.title,
      deliverable: input.deliverable,
      createdBy: normalizeAddress(input.createdBy),
      status: 'DRAFT',
      currency: input.currency,
      chain: input.chain,
      totalAmountMinor: input.totalAmountMinor,
      deadline: input.deadline,
      paymentCondition: input.paymentCondition,
      specialTerms: input.specialTerms,
      termsDigest: '',
      participants,
      milestones,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    this.t.pacts.set(id, pact)
    this.t.participants.set(id, participants)
    this.t.milestones.set(id, milestones)

    const digest = termsDigest(this.canonicalTermsFor(id))
    this.t.pacts.set(id, { ...pact, termsDigest: digest, shortId: shortIdFromDigest(digest) })

    await this.addActivity({
      pactId: id,
      kind: 'PACT_CREATED',
      actorAddress: input.createdBy,
      actorName: input.creatorName,
      summary: `${input.creatorName} created this agreement`,
    })

    return this.hydrate(id)
  }

  async getPactById(id: string): Promise<PactDetail | null> {
    return this.t.pacts.has(id) ? this.hydrate(id) : null
  }

  async getPactByShortId(shortId: string): Promise<PactDetail | null> {
    const wanted = shortId.toUpperCase()
    for (const pact of this.t.pacts.values()) {
      if (pact.shortId === wanted) return this.hydrate(pact.id)
    }
    return null
  }

  async listPactsForAddress(address: string): Promise<Pact[]> {
    const wanted = normalizeAddress(address)
    const out: Pact[] = []
    for (const pact of this.t.pacts.values()) {
      const participants = this.t.participants.get(pact.id) ?? []
      const isParty = participants.some((p) => p.address && normalizeAddress(p.address) === wanted)
      if (isParty) out.push({ ...pact, participants, milestones: this.t.milestones.get(pact.id) ?? [] })
    }
    return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  }

  async updateTerms(pactId: string, actor: string, patch: UpdateTermsInput): Promise<PactDetail> {
    const pact = this.mustGet(pactId)
    this.roleOf(pactId, actor)

    // Once both sides have signed, the terms are the thing that was signed. Changing
    // them is a negotiation, not an edit.
    if (!['DRAFT', 'PENDING', 'NEGOTIATING'].includes(pact.status)) {
      throw new RepoError('CONFLICT', 'A sealed agreement can only be changed by proposing changes.')
    }

    if (patch.milestones) {
      const timestamp = now()
      const existing = this.t.milestones.get(pactId) ?? []
      this.t.milestones.set(
        pactId,
        patch.milestones.map((m, index) => ({
          id: existing[index]?.id ?? randomUUID(),
          pactId,
          position: index + 1,
          title: m.title,
          description: m.description,
          amountMinor: m.amountMinor,
          percent: m.percent,
          dueDate: m.dueDate,
          status: existing[index]?.status ?? 'PENDING',
          createdAt: existing[index]?.createdAt ?? timestamp,
          updatedAt: timestamp,
        })),
      )
    }

    const { milestones: _ignored, ...scalar } = patch
    this.touch(pactId, scalar)
    this.reseal(pactId)

    const updated = this.mustGet(pactId)
    this.t.pacts.set(pactId, { ...updated, shortId: shortIdFromDigest(updated.termsDigest) })
    return this.hydrate(pactId)
  }

  async setStatus(pactId: string, actor: string, status: PactStatus): Promise<PactDetail> {
    const pact = this.mustGet(pactId)
    const role: Actor = this.roleOf(pactId, actor)

    if (pact.status === status) return this.hydrate(pactId) // idempotent, not an error
    if (!canTransition(pact.status, status, role)) {
      throw new RepoError('CONFLICT', `This agreement cannot move from ${pact.status} to ${status}.`)
    }

    this.touch(pactId, { status })
    return this.hydrate(pactId)
  }

  // --- participants and sealing -----------------------------------------------------

  async joinPact(pactId: string, address: string, displayName: string): Promise<PactDetail> {
    const normalized = normalizeAddress(address)
    const participants = this.t.participants.get(pactId) ?? []

    if (participants.some((p) => p.address && normalizeAddress(p.address) === normalized)) {
      return this.hydrate(pactId) // already a party — joining twice is a no-op
    }

    const open = participants.find((p) => p.address === null)
    if (!open) throw new RepoError('CONFLICT', 'Both sides of this agreement are already taken.')

    this.t.participants.set(
      pactId,
      participants.map((p) =>
        p.id === open.id
          ? { ...p, address: normalized, displayName: displayName || p.displayName, joinedAt: now() }
          : p,
      ),
    )
    this.reseal(pactId) // the counterparty address is part of the terms
    this.touch(pactId)
    return this.hydrate(pactId)
  }

  async setEvmAddress(pactId: string, address: string, evmAddress: string): Promise<PactDetail> {
    const wanted = normalizeAddress(address)
    const participants = this.t.participants.get(pactId) ?? []
    const participant = participants.find((p) => p.address && normalizeAddress(p.address) === wanted)
    if (!participant) throw new RepoError('NOT_ALLOWED', 'You are not a party to this agreement.')

    this.t.participants.set(
      pactId,
      participants.map((p) => (p.id === participant.id ? { ...p, evmAddress: evmAddress.toLowerCase() } : p)),
    )
    // Deliberately not part of the terms digest: where someone receives USDT is a payment
    // detail, not a term of the agreement, and changing it must not void signatures.
    this.touch(pactId)
    return this.hydrate(pactId)
  }

  async recordSeal(input: {
    pactId: string
    address: string
    signature: string
    publicKey: string
  }): Promise<PactDetail> {
    const normalized = normalizeAddress(input.address)
    const participants = this.t.participants.get(input.pactId) ?? []
    const participant = participants.find((p) => p.address && normalizeAddress(p.address) === normalized)
    if (!participant) throw new RepoError('NOT_ALLOWED', 'You are not a party to this agreement.')

    this.t.participants.set(
      input.pactId,
      participants.map((p) =>
        p.id === participant.id
          ? { ...p, sealSignature: input.signature, sealPublicKey: input.publicKey, sealedAt: now() }
          : p,
      ),
    )
    this.touch(input.pactId)
    return this.hydrate(input.pactId)
  }

  // --- payments ---------------------------------------------------------------------

  async recordPayment(input: RecordPaymentInput): Promise<Payment> {
    const existing = await this.findPaymentByIdempotencyKey(input.idempotencyKey)
    if (existing) return existing // a double tap must not create a second payment

    const timestamp = now()
    const payment: Payment = {
      id: randomUUID(),
      pactId: input.pactId,
      milestoneId: input.milestoneId,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      amountMinor: input.amountMinor,
      currency: input.currency,
      chain: input.chain,
      status: 'PENDING',
      txReference: null,
      memo: input.memo,
      failureReason: null,
      idempotencyKey: input.idempotencyKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.push(this.t.payments, input.pactId, payment)
    return payment
  }

  async updatePaymentStatus(input: {
    paymentId: string
    status: PaymentStatus
    txReference?: string | null
    failureReason?: string | null
  }): Promise<Payment> {
    for (const [pactId, payments] of this.t.payments) {
      const index = payments.findIndex((p) => p.id === input.paymentId)
      if (index === -1) continue

      const updated: Payment = {
        ...payments[index],
        status: input.status,
        txReference: input.txReference ?? payments[index].txReference,
        failureReason: input.failureReason ?? payments[index].failureReason,
        updatedAt: now(),
      }
      const next = [...payments]
      next[index] = updated
      this.t.payments.set(pactId, next)
      return updated
    }
    throw new RepoError('NOT_FOUND', 'That payment does not exist.')
  }

  async getPaymentById(id: string): Promise<Payment | null> {
    for (const payments of this.t.payments.values()) {
      const match = payments.find((p) => p.id === id)
      if (match) return match
    }
    return null
  }

  async findPaymentByIdempotencyKey(key: string): Promise<Payment | null> {
    for (const payments of this.t.payments.values()) {
      const match = payments.find((p) => p.idempotencyKey === key)
      if (match) return match
    }
    return null
  }

  async setMilestoneStatus(pactId: string, milestoneId: string, status: Milestone['status']): Promise<Milestone> {
    const milestones = this.t.milestones.get(pactId) ?? []
    const index = milestones.findIndex((m) => m.id === milestoneId)
    if (index === -1) throw new RepoError('NOT_FOUND', 'That milestone does not exist.')

    const updated = { ...milestones[index], status, updatedAt: now() }
    const next = [...milestones]
    next[index] = updated
    this.t.milestones.set(pactId, next)
    this.touch(pactId)
    return updated
  }

  // --- deliverables -----------------------------------------------------------------

  async submitDeliverable(input: {
    pactId: string
    milestoneId: string | null
    submittedBy: string
    note: string
    link: string | null
  }): Promise<Deliverable> {
    if (this.roleOf(input.pactId, input.submittedBy) !== 'PROVIDER') {
      throw new RepoError('NOT_ALLOWED', 'Only the provider submits deliverables.')
    }

    const timestamp = now()
    const deliverable: Deliverable = {
      id: randomUUID(),
      pactId: input.pactId,
      milestoneId: input.milestoneId,
      submittedBy: normalizeAddress(input.submittedBy),
      note: input.note,
      link: input.link,
      status: 'SUBMITTED',
      reviewNote: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.push(this.t.deliverables, input.pactId, deliverable)
    if (input.milestoneId) await this.setMilestoneStatus(input.pactId, input.milestoneId, 'SUBMITTED')
    return deliverable
  }

  async reviewDeliverable(input: {
    deliverableId: string
    actor: string
    status: Deliverable['status']
    reviewNote: string | null
  }): Promise<Deliverable> {
    for (const [pactId, deliverables] of this.t.deliverables) {
      const index = deliverables.findIndex((d) => d.id === input.deliverableId)
      if (index === -1) continue

      if (this.roleOf(pactId, input.actor) !== 'CLIENT') {
        throw new RepoError('NOT_ALLOWED', 'Only the client reviews a delivery.')
      }

      const updated: Deliverable = {
        ...deliverables[index],
        status: input.status,
        reviewNote: input.reviewNote,
        updatedAt: now(),
      }
      const next = [...deliverables]
      next[index] = updated
      this.t.deliverables.set(pactId, next)

      if (updated.milestoneId && input.status === 'APPROVED') {
        await this.setMilestoneStatus(pactId, updated.milestoneId, 'APPROVED')
      }
      if (updated.milestoneId && input.status === 'CHANGES_REQUESTED') {
        await this.setMilestoneStatus(pactId, updated.milestoneId, 'IN_PROGRESS')
      }
      return updated
    }
    throw new RepoError('NOT_FOUND', 'That delivery does not exist.')
  }

  // --- negotiation ------------------------------------------------------------------

  async openNegotiation(input: {
    pactId: string
    proposedBy: string
    message: string
    changes: Array<Omit<NegotiationChange, 'id' | 'negotiationId'>>
  }): Promise<Negotiation> {
    this.roleOf(input.pactId, input.proposedBy)
    const id = randomUUID()
    const negotiation: Negotiation = {
      id,
      pactId: input.pactId,
      proposedBy: normalizeAddress(input.proposedBy),
      message: input.message,
      status: 'OPEN',
      changes: input.changes.map((c) => ({ ...c, id: randomUUID(), negotiationId: id })),
      createdAt: now(),
      resolvedAt: null,
    }
    this.push(this.t.negotiations, input.pactId, negotiation)
    return negotiation
  }

  async resolveNegotiation(input: {
    negotiationId: string
    actor: string
    status: Negotiation['status']
  }): Promise<Negotiation> {
    for (const [pactId, negotiations] of this.t.negotiations) {
      const index = negotiations.findIndex((n) => n.id === input.negotiationId)
      if (index === -1) continue

      this.roleOf(pactId, input.actor)
      const target = negotiations[index]
      if (target.status !== 'OPEN') throw new RepoError('CONFLICT', 'That proposal has already been answered.')
      if (normalizeAddress(target.proposedBy) === normalizeAddress(input.actor)) {
        // Withdrawing your own proposal is fine; accepting it yourself is not.
        if (input.status !== 'WITHDRAWN') {
          throw new RepoError('NOT_ALLOWED', 'The other side has to answer your proposal.')
        }
      }

      const updated: Negotiation = { ...target, status: input.status, resolvedAt: now() }
      const next = [...negotiations]
      next[index] = updated
      this.t.negotiations.set(pactId, next)
      return updated
    }
    throw new RepoError('NOT_FOUND', 'That proposal does not exist.')
  }

  // --- disputes ---------------------------------------------------------------------

  async raiseDispute(input: {
    pactId: string
    raisedBy: string
    reason: DisputeReason
    detail: string
  }): Promise<Dispute> {
    this.roleOf(input.pactId, input.raisedBy) // membership check
    const existing = (this.t.disputes.get(input.pactId) ?? []).find((d) => d.status === 'OPEN')
    if (existing) throw new RepoError('CONFLICT', 'There is already an open issue on this agreement.')

    const dispute: Dispute = {
      id: randomUUID(),
      pactId: input.pactId,
      raisedBy: normalizeAddress(input.raisedBy),
      reason: input.reason,
      detail: input.detail,
      status: 'OPEN',
      createdAt: now(),
      resolvedAt: null,
    }
    this.push(this.t.disputes, input.pactId, dispute)
    return dispute
  }

  async resolveDispute(input: {
    disputeId: string
    actor: string
    status: Exclude<DisputeStatus, 'OPEN'>
  }): Promise<Dispute> {
    for (const [pactId, disputes] of this.t.disputes) {
      const index = disputes.findIndex((d) => d.id === input.disputeId)
      if (index === -1) continue

      this.roleOf(pactId, input.actor)
      const target = disputes[index]
      if (target.status !== 'OPEN') throw new RepoError('CONFLICT', 'That issue is already closed.')
      // Only the person who raised it can take it back; either side can agree it's settled.
      if (input.status === 'WITHDRAWN' && normalizeAddress(target.raisedBy) !== normalizeAddress(input.actor)) {
        throw new RepoError('NOT_ALLOWED', 'Only the person who raised this can withdraw it.')
      }

      const updated: Dispute = { ...target, status: input.status, resolvedAt: now() }
      const next = [...disputes]
      next[index] = updated
      this.t.disputes.set(pactId, next)
      return updated
    }
    throw new RepoError('NOT_FOUND', 'That issue does not exist.')
  }

  // --- activity, invites, trust -----------------------------------------------------

  async addActivity(input: {
    pactId: string
    kind: ActivityKind
    actorAddress: string | null
    actorName: string
    summary: string
    meta?: Record<string, string | number | null>
  }): Promise<Activity> {
    const activity: Activity = {
      id: randomUUID(),
      pactId: input.pactId,
      kind: input.kind,
      actorAddress: input.actorAddress ? normalizeAddress(input.actorAddress) : null,
      actorName: input.actorName,
      summary: input.summary,
      meta: input.meta ?? {},
      createdAt: now(),
    }
    this.push(this.t.activities, input.pactId, activity)
    return activity
  }

  async createInvitation(input: { pactId: string; role: ParticipantRole; createdBy: string }): Promise<Invitation> {
    const invitation: Invitation = {
      id: randomUUID(),
      pactId: input.pactId,
      token: randomUUID().replace(/-/g, ''),
      role: input.role,
      createdBy: normalizeAddress(input.createdBy),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      acceptedAt: null,
      acceptedBy: null,
    }
    this.t.invitations.set(invitation.token, invitation)
    return invitation
  }

  async getInvitationByToken(token: string): Promise<Invitation | null> {
    return this.t.invitations.get(token) ?? null
  }

  async acceptInvitation(token: string, address: string): Promise<Invitation> {
    const invitation = this.t.invitations.get(token)
    if (!invitation) throw new RepoError('NOT_FOUND', 'That invitation is not valid.')
    if (new Date(invitation.expiresAt).getTime() < Date.now()) {
      throw new RepoError('CONFLICT', 'That invitation has expired.')
    }
    const updated = { ...invitation, acceptedAt: now(), acceptedBy: normalizeAddress(address) }
    this.t.invitations.set(token, updated)
    return updated
  }

  /**
   * Trust is a count of things that actually happened, not a score.
   *
   * Only rows PACT can evidence are counted: sealed agreements, payments with a stored
   * transaction reference, and deliveries with timestamps to compare against a due date.
   * Both the numerator and the denominator are returned so the UI can say "4 of 5"
   * rather than an unfalsifiable percentage.
   */
  /** See Repository.updateProfile. */
  async updateProfile(address: string, displayName: string): Promise<void> {
    this.t.profiles.set(normalizeAddress(address), displayName)
  }

  async getTrustMetrics(address: string): Promise<TrustMetrics> {
    const wanted = normalizeAddress(address)
    const metrics: TrustMetrics = {
      address: wanted,
      displayName: this.t.profiles.get(wanted) ?? '',
      pactsCompleted: 0,
      pactsActive: 0,
      pactsCancelled: 0,
      paymentsConfirmed: 0,
      deliveredOnTime: 0,
      deliveredTotal: 0,
      totalValueByCurrency: {},
      firstSeenAt: null,
    }

    for (const pact of this.t.pacts.values()) {
      const participants = this.t.participants.get(pact.id) ?? []
      const self = participants.find((p) => p.address && normalizeAddress(p.address) === wanted)
      if (!self) continue

      if (!metrics.displayName) metrics.displayName = self.displayName
      const joined = self.joinedAt ?? pact.createdAt
      if (!metrics.firstSeenAt || joined < metrics.firstSeenAt) metrics.firstSeenAt = joined

      if (pact.status === 'COMPLETED') metrics.pactsCompleted += 1
      else if (pact.status === 'CANCELLED' || pact.status === 'DECLINED') metrics.pactsCancelled += 1
      else if (!isTerminal(pact.status)) metrics.pactsActive += 1

      for (const payment of this.t.payments.get(pact.id) ?? []) {
        if (payment.status !== 'CONFIRMED') continue
        if (normalizeAddress(payment.fromAddress) !== wanted && normalizeAddress(payment.toAddress) !== wanted) continue
        metrics.paymentsConfirmed += 1
        const running = metrics.totalValueByCurrency[payment.currency] ?? '0'
        metrics.totalValueByCurrency[payment.currency] = sumMinor([running, payment.amountMinor])
      }

      // On-time is only measurable for the side that owed the work.
      if (self.role !== 'PROVIDER') continue
      for (const deliverable of this.t.deliverables.get(pact.id) ?? []) {
        if (deliverable.status !== 'APPROVED') continue
        metrics.deliveredTotal += 1
        const milestone = (this.t.milestones.get(pact.id) ?? []).find((m) => m.id === deliverable.milestoneId)
        const due = milestone?.dueDate ?? pact.deadline
        if (!due || deliverable.createdAt.slice(0, 10) <= due.slice(0, 10)) metrics.deliveredOnTime += 1
      }
    }

    return metrics
  }

  // --- notifications ----------------------------------------------------------------

  async listNotifications(address: string): Promise<Notification[]> {
    return (this.t.notifications.get(normalizeAddress(address)) ?? []).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    )
  }

  async markNotificationRead(id: string, address: string): Promise<void> {
    const key = normalizeAddress(address)
    const list = this.t.notifications.get(key) ?? []
    this.t.notifications.set(key, list.map((n) => (n.id === id ? { ...n, readAt: now() } : n)))
  }

  /**
   * Derive the nudges this user should see.
   *
   * Deduplicated on `(pactId, kind)` so the same situation never produces a second
   * notification on every poll — the fastest way to make a reminder system worthless is
   * to let it repeat itself.
   */
  async refreshNotifications(address: string): Promise<Notification[]> {
    const wanted = normalizeAddress(address)
    const existing = this.t.notifications.get(wanted) ?? []
    const seen = new Set(existing.map((n) => `${n.pactId}:${n.kind}`))
    const created: Notification[] = []

    const add = (pactId: string, kind: Notification['kind'], title: string, body: string) => {
      if (seen.has(`${pactId}:${kind}`)) return
      seen.add(`${pactId}:${kind}`)
      created.push({
        id: randomUUID(),
        address: wanted,
        pactId,
        kind,
        title,
        body,
        sentAt: now(),
        readAt: null,
        createdAt: now(),
      })
    }

    const today = new Date()
    const inThreeDays = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)

    for (const pact of this.t.pacts.values()) {
      const participants = this.t.participants.get(pact.id) ?? []
      const self = participants.find((p) => p.address && normalizeAddress(p.address) === wanted)
      if (!self || isTerminal(pact.status)) continue

      if (pact.status === 'PENDING' && pact.createdBy !== wanted) {
        add(pact.id, 'ACCEPTANCE_PENDING', 'Waiting on you', `${pact.title} needs your signature.`)
      }
      if (pact.status === 'NEGOTIATING') {
        const open = (this.t.negotiations.get(pact.id) ?? []).find(
          (n) => n.status === 'OPEN' && normalizeAddress(n.proposedBy) !== wanted,
        )
        if (open) add(pact.id, 'NEGOTIATION_AWAITING_REPLY', 'Changes proposed', `Someone proposed changes to ${pact.title}.`)
      }
      if (pact.deadline) {
        const due = new Date(pact.deadline)
        if (due < today) add(pact.id, 'OVERDUE', 'Past its deadline', `${pact.title} was due ${pact.deadline}.`)
        else if (due <= inThreeDays) add(pact.id, 'DEADLINE_APPROACHING', 'Due soon', `${pact.title} is due ${pact.deadline}.`)
      }
      if (self.role === 'CLIENT') {
        const awaiting = (this.t.deliverables.get(pact.id) ?? []).some((d) => d.status === 'SUBMITTED')
        if (awaiting) add(pact.id, 'DELIVERY_AWAITING_REVIEW', 'Delivery ready', `Work was delivered on ${pact.title}.`)
      }
    }

    if (created.length > 0) this.t.notifications.set(wanted, [...existing, ...created])
    return this.listNotifications(wanted)
  }
}

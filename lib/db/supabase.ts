import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { canTransition, isTerminal, type Actor } from '../pact/state.ts'
import { shortIdFromDigest, termsDigest, type CanonicalTerms } from '../pact/digest.ts'
import { sumMinor } from '../pact/money.ts'
import { normalizeAddress } from '../nimiq/address.ts'
import type {
  Activity,
  ActivityKind,
  Deliverable,
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
 * Postgres-backed repository.
 *
 * Mirrors `MemoryRepository` exactly — same authorisation, same invariants, same errors.
 * The in-process store is the reference implementation and the one the tests pin; this
 * one has to agree with it.
 *
 * Two Postgres-specific hazards handled here rather than discovered later:
 *
 *  1. **`numeric` loses precision over JSON.** PostgREST serialises `numeric` as a JSON
 *     number, so a large amount would come back as a lossy float. Every money column is
 *     therefore selected with an explicit `::text` cast and kept as a string, matching
 *     the minor-unit-string convention the rest of the app uses.
 *
 *  2. **PostgREST has no transactions.** Creating a pact means several inserts across
 *     several tables. If a later one fails we delete the pact row, and the foreign keys
 *     cascade the rest away — a compensating action, so a failed create never leaves a
 *     half-built agreement behind.
 */

// Money columns are cast to text everywhere they are read.
const PACT_COLUMNS =
  'id, short_id, title, deliverable, created_by, status, currency, chain, total_amount_minor::text, deadline, payment_condition, special_terms, terms_digest, created_at, updated_at'
const PARTICIPANT_COLUMNS =
  'id, pact_id, role, address, display_name, evm_address, seal_signature, seal_public_key, sealed_at, joined_at'
const MILESTONE_COLUMNS =
  'id, pact_id, position, title, description, amount_minor::text, percent, due_date, status, created_at, updated_at'
const PAYMENT_COLUMNS =
  'id, pact_id, milestone_id, from_address, to_address, amount_minor::text, currency, chain, status, tx_reference, memo, failure_reason, idempotency_key, created_at, updated_at'

type Row = Record<string, unknown>

const str = (value: unknown): string => (value == null ? '' : String(value))
const nullable = (value: unknown): string | null => (value == null ? null : String(value))

function toPact(row: Row): Omit<Pact, 'participants' | 'milestones'> {
  return {
    id: str(row.id),
    shortId: str(row.short_id),
    title: str(row.title),
    deliverable: str(row.deliverable),
    createdBy: str(row.created_by),
    status: str(row.status) as PactStatus,
    currency: str(row.currency) as Pact['currency'],
    chain: (nullable(row.chain) as Pact['chain']) ?? null,
    totalAmountMinor: str(row.total_amount_minor),
    deadline: nullable(row.deadline),
    paymentCondition: str(row.payment_condition),
    specialTerms: Array.isArray(row.special_terms) ? (row.special_terms as string[]) : [],
    termsDigest: str(row.terms_digest),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  }
}

function toParticipant(row: Row): Participant {
  return {
    id: str(row.id),
    pactId: str(row.pact_id),
    role: str(row.role) as ParticipantRole,
    address: nullable(row.address),
    displayName: str(row.display_name),
    evmAddress: nullable(row.evm_address),
    sealSignature: nullable(row.seal_signature),
    sealPublicKey: nullable(row.seal_public_key),
    sealedAt: nullable(row.sealed_at),
    joinedAt: nullable(row.joined_at),
  }
}

function toMilestone(row: Row): Milestone {
  return {
    id: str(row.id),
    pactId: str(row.pact_id),
    position: Number(row.position),
    title: str(row.title),
    description: str(row.description),
    amountMinor: str(row.amount_minor),
    percent: Number(row.percent),
    dueDate: nullable(row.due_date),
    status: str(row.status) as Milestone['status'],
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  }
}

function toPayment(row: Row): Payment {
  return {
    id: str(row.id),
    pactId: str(row.pact_id),
    milestoneId: nullable(row.milestone_id),
    fromAddress: str(row.from_address),
    toAddress: str(row.to_address),
    amountMinor: str(row.amount_minor),
    currency: str(row.currency) as Payment['currency'],
    chain: (nullable(row.chain) as Payment['chain']) ?? null,
    status: str(row.status) as PaymentStatus,
    txReference: nullable(row.tx_reference),
    memo: nullable(row.memo),
    failureReason: nullable(row.failure_reason),
    idempotencyKey: str(row.idempotency_key),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  }
}

function toDeliverable(row: Row): Deliverable {
  return {
    id: str(row.id),
    pactId: str(row.pact_id),
    milestoneId: nullable(row.milestone_id),
    submittedBy: str(row.submitted_by),
    note: str(row.note),
    link: nullable(row.link),
    status: str(row.status) as Deliverable['status'],
    reviewNote: nullable(row.review_note),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  }
}

function toActivity(row: Row): Activity {
  return {
    id: str(row.id),
    pactId: str(row.pact_id),
    kind: str(row.kind) as ActivityKind,
    actorAddress: nullable(row.actor_address),
    actorName: str(row.actor_name),
    summary: str(row.summary),
    meta: (row.meta as Activity['meta']) ?? {},
    createdAt: str(row.created_at),
  }
}

function toInvitation(row: Row): Invitation {
  return {
    id: str(row.id),
    pactId: str(row.pact_id),
    token: str(row.token),
    role: str(row.role) as ParticipantRole,
    createdBy: str(row.created_by),
    expiresAt: str(row.expires_at),
    acceptedAt: nullable(row.accepted_at),
    acceptedBy: nullable(row.accepted_by),
  }
}

function toNotification(row: Row): Notification {
  return {
    id: str(row.id),
    address: str(row.address),
    pactId: str(row.pact_id),
    kind: str(row.kind) as Notification['kind'],
    title: str(row.title),
    body: str(row.body),
    sentAt: nullable(row.sent_at),
    readAt: nullable(row.read_at),
    createdAt: str(row.created_at),
  }
}

/** Turn a PostgREST failure into the same typed errors the memory store raises. */
function fail(error: { code?: string; message: string } | null, fallback: string): never {
  if (error?.code === '23505') throw new RepoError('CONFLICT', 'That already exists.')
  if (error?.code === '23514') throw new RepoError('INVALID', 'That value is not allowed.')
  if (error?.code === '23503') throw new RepoError('INVALID', 'That references something that does not exist.')
  throw new RepoError('INVALID', error?.message ?? fallback)
}

export class SupabaseRepository implements Repository {
  // Typed from the call rather than annotated: `SupabaseClient` defaults its schema
  // parameter to "public", and PACT's client is bound to the "pact" schema.
  private readonly db: ReturnType<typeof SupabaseRepository.connect>

  private static connect(url: string, serviceRoleKey: string) {
    return createClient(url, serviceRoleKey, {
      // PACT's tables live in their own schema so they can share a project safely.
      db: { schema: 'pact' },
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  constructor(url: string, serviceRoleKey: string) {
    this.db = SupabaseRepository.connect(url, serviceRoleKey)
  }

  // --- helpers ----------------------------------------------------------------------

  /** Foreign keys point at `users`, so an address must exist before it can be referenced. */
  private async ensureUser(address: string, displayName?: string): Promise<string> {
    const normalized = normalizeAddress(address)
    const { error } = await this.db
      .from('users')
      .upsert({ address: normalized, last_seen_at: new Date().toISOString() }, { onConflict: 'address' })
    if (error) fail(error, 'Could not record that address.')

    if (displayName) {
      await this.db.from('profiles').upsert({ address: normalized, display_name: displayName }, { onConflict: 'address' })
    }
    return normalized
  }

  private async hydrate(pactId: string): Promise<PactDetail> {
    const [pactResult, participants, milestones, payments, deliverables, negotiations, activities] = await Promise.all([
      this.db.from('pacts').select(PACT_COLUMNS).eq('id', pactId).maybeSingle(),
      this.db.from('pact_participants').select(PARTICIPANT_COLUMNS).eq('pact_id', pactId).order('role'),
      this.db.from('milestones').select(MILESTONE_COLUMNS).eq('pact_id', pactId).order('position'),
      this.db.from('payments').select(PAYMENT_COLUMNS).eq('pact_id', pactId).order('created_at'),
      this.db.from('deliverables').select('*').eq('pact_id', pactId).order('created_at'),
      this.db.from('negotiations').select('*, negotiation_changes(*)').eq('pact_id', pactId).order('created_at'),
      this.db.from('activities').select('*').eq('pact_id', pactId).order('created_at'),
    ])

    if (!pactResult.data) throw new RepoError('NOT_FOUND', 'That agreement does not exist.')

    return {
      ...toPact(pactResult.data as Row),
      participants: ((participants.data ?? []) as Row[]).map(toParticipant),
      milestones: ((milestones.data ?? []) as Row[]).map(toMilestone),
      payments: ((payments.data ?? []) as Row[]).map(toPayment),
      deliverables: ((deliverables.data ?? []) as Row[]).map(toDeliverable),
      negotiations: ((negotiations.data ?? []) as Row[]).map((row) => ({
        id: str(row.id),
        pactId: str(row.pact_id),
        proposedBy: str(row.proposed_by),
        message: str(row.message),
        status: str(row.status) as Negotiation['status'],
        changes: ((row.negotiation_changes as Row[]) ?? []).map((change) => ({
          id: str(change.id),
          negotiationId: str(change.negotiation_id),
          field: str(change.field),
          label: str(change.label),
          originalValue: str(change.original_value),
          proposedValue: str(change.proposed_value),
        })),
        createdAt: str(row.created_at),
        resolvedAt: nullable(row.resolved_at),
      })),
      activities: ((activities.data ?? []) as Row[]).map(toActivity),
    }
  }

  private async roleOf(pactId: string, address: string): Promise<ParticipantRole> {
    const { data } = await this.db
      .from('pact_participants')
      .select('role')
      .eq('pact_id', pactId)
      .eq('address', normalizeAddress(address))
      .maybeSingle()

    if (!data) throw new RepoError('NOT_ALLOWED', 'You are not a party to this agreement.')
    return str(data.role) as ParticipantRole
  }

  private async canonicalTermsFor(pactId: string): Promise<CanonicalTerms> {
    const detail = await this.hydrate(pactId)
    return {
      title: detail.title,
      deliverable: detail.deliverable,
      currency: detail.currency,
      chain: detail.chain,
      totalAmountMinor: detail.totalAmountMinor,
      deadline: detail.deadline,
      paymentCondition: detail.paymentCondition,
      specialTerms: detail.specialTerms,
      participants: detail.participants.map((p) => ({
        role: p.role,
        displayName: p.displayName,
        address: p.address,
      })),
      milestones: detail.milestones.map((m) => ({
        position: m.position,
        title: m.title,
        amountMinor: m.amountMinor,
        dueDate: m.dueDate,
      })),
    }
  }

  /**
   * Recompute the fingerprint and, if it moved, clear every signature.
   *
   * Same invariant as the memory store: a sealed agreement always carries signatures over
   * its *current* terms, so nobody stays bound to something they did not see.
   */
  private async reseal(pactId: string): Promise<void> {
    const digest = termsDigest(await this.canonicalTermsFor(pactId))
    const { data } = await this.db.from('pacts').select('terms_digest').eq('id', pactId).maybeSingle()
    if (!data || str(data.terms_digest) === digest) return

    await this.db
      .from('pacts')
      .update({ terms_digest: digest, short_id: shortIdFromDigest(digest) })
      .eq('id', pactId)

    await this.db
      .from('pact_participants')
      .update({ seal_signature: null, seal_public_key: null, sealed_at: null })
      .eq('pact_id', pactId)
  }

  // --- pacts ------------------------------------------------------------------------

  async createPact(input: CreatePactInput): Promise<PactDetail> {
    if (
      input.milestones.length > 0 &&
      sumMinor(input.milestones.map((m) => m.amountMinor)) !== input.totalAmountMinor
    ) {
      throw new RepoError('INVALID', 'Milestone amounts must add up to the total.')
    }

    const creator = await this.ensureUser(input.createdBy, input.creatorName)
    if (input.counterpartyAddress) await this.ensureUser(input.counterpartyAddress)

    // The digest depends on the participants, so a placeholder goes in first and the
    // real value is written by reseal() once the rows exist.
    const placeholder = '0'.repeat(32)
    const { data: created, error } = await this.db
      .from('pacts')
      .insert({
        short_id: shortIdFromDigest(placeholder),
        title: input.title,
        deliverable: input.deliverable,
        created_by: creator,
        status: 'DRAFT',
        currency: input.currency,
        chain: input.chain,
        total_amount_minor: input.totalAmountMinor,
        deadline: input.deadline,
        payment_condition: input.paymentCondition,
        special_terms: input.specialTerms,
        terms_digest: placeholder,
      })
      .select('id')
      .single()

    if (error || !created) fail(error, 'Could not create that agreement.')
    const pactId = str(created.id)

    try {
      const counterRole: ParticipantRole = input.creatorRole === 'CLIENT' ? 'PROVIDER' : 'CLIENT'
      const now = new Date().toISOString()

      const { error: participantError } = await this.db.from('pact_participants').insert([
        {
          pact_id: pactId,
          role: input.creatorRole,
          address: creator,
          display_name: input.creatorName,
          joined_at: now,
        },
        {
          pact_id: pactId,
          role: counterRole,
          address: input.counterpartyAddress ? normalizeAddress(input.counterpartyAddress) : null,
          display_name: input.counterpartyName,
          joined_at: null,
        },
      ])
      if (participantError) fail(participantError, 'Could not record the parties.')

      if (input.milestones.length > 0) {
        const { error: milestoneError } = await this.db.from('milestones').insert(
          input.milestones.map((m, index) => ({
            pact_id: pactId,
            position: index + 1,
            title: m.title,
            description: m.description,
            amount_minor: m.amountMinor,
            percent: m.percent,
            due_date: m.dueDate,
          })),
        )
        if (milestoneError) fail(milestoneError, 'Could not record the milestones.')
      }

      await this.reseal(pactId)
      await this.addActivity({
        pactId,
        kind: 'PACT_CREATED',
        actorAddress: creator,
        actorName: input.creatorName,
        summary: `${input.creatorName} created this agreement`,
      })

      return this.hydrate(pactId)
    } catch (cause) {
      // Compensating delete: foreign keys cascade, so a failed create leaves nothing
      // half-built behind. PostgREST gives us no transaction to roll back instead.
      await this.db.from('pacts').delete().eq('id', pactId)
      throw cause
    }
  }

  async getPactById(id: string): Promise<PactDetail | null> {
    try {
      return await this.hydrate(id)
    } catch {
      return null
    }
  }

  async getPactByShortId(shortId: string): Promise<PactDetail | null> {
    const { data } = await this.db.from('pacts').select('id').eq('short_id', shortId.toUpperCase()).maybeSingle()
    return data ? this.hydrate(str(data.id)) : null
  }

  async listPactsForAddress(address: string): Promise<Pact[]> {
    const { data: memberships } = await this.db
      .from('pact_participants')
      .select('pact_id')
      .eq('address', normalizeAddress(address))

    const ids = ((memberships ?? []) as Row[]).map((row) => str(row.pact_id))
    if (ids.length === 0) return []

    const [pacts, participants, milestones] = await Promise.all([
      this.db.from('pacts').select(PACT_COLUMNS).in('id', ids).order('updated_at', { ascending: false }),
      this.db.from('pact_participants').select(PARTICIPANT_COLUMNS).in('pact_id', ids),
      this.db.from('milestones').select(MILESTONE_COLUMNS).in('pact_id', ids).order('position'),
    ])

    const participantsByPact = new Map<string, Participant[]>()
    for (const row of (participants.data ?? []) as Row[]) {
      const participant = toParticipant(row)
      participantsByPact.set(participant.pactId, [...(participantsByPact.get(participant.pactId) ?? []), participant])
    }

    const milestonesByPact = new Map<string, Milestone[]>()
    for (const row of (milestones.data ?? []) as Row[]) {
      const milestone = toMilestone(row)
      milestonesByPact.set(milestone.pactId, [...(milestonesByPact.get(milestone.pactId) ?? []), milestone])
    }

    return ((pacts.data ?? []) as Row[]).map((row) => {
      const pact = toPact(row)
      return {
        ...pact,
        participants: participantsByPact.get(pact.id) ?? [],
        milestones: milestonesByPact.get(pact.id) ?? [],
      }
    })
  }

  async updateTerms(pactId: string, actor: string, patch: UpdateTermsInput): Promise<PactDetail> {
    await this.roleOf(pactId, actor)
    const current = await this.hydrate(pactId)

    if (!['DRAFT', 'PENDING', 'NEGOTIATING'].includes(current.status)) {
      throw new RepoError('CONFLICT', 'A sealed agreement can only be changed by proposing changes.')
    }

    const update: Row = {}
    if (patch.title !== undefined) update.title = patch.title
    if (patch.deliverable !== undefined) update.deliverable = patch.deliverable
    if (patch.totalAmountMinor !== undefined) update.total_amount_minor = patch.totalAmountMinor
    if (patch.deadline !== undefined) update.deadline = patch.deadline
    if (patch.paymentCondition !== undefined) update.payment_condition = patch.paymentCondition
    if (patch.specialTerms !== undefined) update.special_terms = patch.specialTerms

    if (Object.keys(update).length > 0) {
      const { error } = await this.db.from('pacts').update(update).eq('id', pactId)
      if (error) fail(error, 'Could not update those terms.')
    }

    if (patch.milestones) {
      // Replace wholesale: positions are unique per pact, so editing in place would
      // collide on the unique constraint half way through a reorder.
      await this.db.from('milestones').delete().eq('pact_id', pactId)
      if (patch.milestones.length > 0) {
        const { error } = await this.db.from('milestones').insert(
          patch.milestones.map((m, index) => ({
            pact_id: pactId,
            position: index + 1,
            title: m.title,
            description: m.description,
            amount_minor: m.amountMinor,
            percent: m.percent,
            due_date: m.dueDate,
          })),
        )
        if (error) fail(error, 'Could not update those milestones.')
      }
    }

    await this.reseal(pactId)
    return this.hydrate(pactId)
  }

  async setStatus(pactId: string, actor: string, status: PactStatus): Promise<PactDetail> {
    const role: Actor = await this.roleOf(pactId, actor)
    const current = await this.hydrate(pactId)

    if (current.status === status) return current
    if (!canTransition(current.status, status, role)) {
      throw new RepoError('CONFLICT', `This agreement cannot move from ${current.status} to ${status}.`)
    }

    const { error } = await this.db.from('pacts').update({ status }).eq('id', pactId)
    if (error) fail(error, 'Could not update that agreement.')
    return this.hydrate(pactId)
  }

  // --- participants -----------------------------------------------------------------

  async joinPact(pactId: string, address: string, displayName: string): Promise<PactDetail> {
    const normalized = await this.ensureUser(address, displayName)
    const detail = await this.hydrate(pactId)

    if (detail.participants.some((p) => p.address && normalizeAddress(p.address) === normalized)) {
      return detail
    }

    const open = detail.participants.find((p) => p.address === null)
    if (!open) throw new RepoError('CONFLICT', 'Both sides of this agreement are already taken.')

    const { error } = await this.db
      .from('pact_participants')
      .update({ address: normalized, display_name: displayName || open.displayName, joined_at: new Date().toISOString() })
      .eq('id', open.id)
    if (error) fail(error, 'Could not join that agreement.')

    await this.reseal(pactId) // the counterparty address is part of the terms
    return this.hydrate(pactId)
  }

  async setEvmAddress(pactId: string, address: string, evmAddress: string): Promise<PactDetail> {
    await this.roleOf(pactId, address)
    // Not part of the digest: where someone receives USDT is a payment detail, not a
    // term, so recording it must not void a signature.
    const { error } = await this.db
      .from('pact_participants')
      .update({ evm_address: evmAddress.toLowerCase() })
      .eq('pact_id', pactId)
      .eq('address', normalizeAddress(address))
    if (error) fail(error, 'Could not record that address.')
    return this.hydrate(pactId)
  }

  async recordSeal(input: {
    pactId: string
    address: string
    signature: string
    publicKey: string
  }): Promise<PactDetail> {
    await this.roleOf(input.pactId, input.address)

    const { error } = await this.db
      .from('pact_participants')
      .update({
        seal_signature: input.signature,
        seal_public_key: input.publicKey,
        sealed_at: new Date().toISOString(),
      })
      .eq('pact_id', input.pactId)
      .eq('address', normalizeAddress(input.address))
    if (error) fail(error, 'Could not record that signature.')

    return this.hydrate(input.pactId)
  }

  // --- payments ---------------------------------------------------------------------

  async recordPayment(input: RecordPaymentInput): Promise<Payment> {
    const existing = await this.findPaymentByIdempotencyKey(input.idempotencyKey)
    if (existing) return existing

    const { data, error } = await this.db
      .from('payments')
      .insert({
        pact_id: input.pactId,
        milestone_id: input.milestoneId,
        from_address: input.fromAddress,
        to_address: input.toAddress,
        amount_minor: input.amountMinor,
        currency: input.currency,
        chain: input.chain,
        status: 'PENDING',
        memo: input.memo,
        idempotency_key: input.idempotencyKey,
      })
      .select(PAYMENT_COLUMNS)
      .single()

    if (error || !data) {
      // A unique violation means a concurrent request already created it — return theirs.
      const raced = await this.findPaymentByIdempotencyKey(input.idempotencyKey)
      if (raced) return raced
      fail(error, 'Could not record that payment.')
    }
    return toPayment(data as Row)
  }

  async updatePaymentStatus(input: {
    paymentId: string
    status: PaymentStatus
    txReference?: string | null
    failureReason?: string | null
  }): Promise<Payment> {
    const update: Row = { status: input.status }
    if (input.txReference !== undefined && input.txReference !== null) update.tx_reference = input.txReference
    if (input.failureReason !== undefined && input.failureReason !== null) update.failure_reason = input.failureReason

    const { data, error } = await this.db
      .from('payments')
      .update(update)
      .eq('id', input.paymentId)
      .select(PAYMENT_COLUMNS)
      .maybeSingle()

    if (error) {
      // The database refuses SUBMITTED/CONFIRMED without a reference. Surface that as
      // the rule it is rather than as a generic failure.
      if (error.code === '23514') {
        throw new RepoError('INVALID', 'A payment cannot be marked sent or confirmed without a transaction reference.')
      }
      fail(error, 'Could not update that payment.')
    }
    if (!data) throw new RepoError('NOT_FOUND', 'That payment does not exist.')
    return toPayment(data as Row)
  }

  async findPaymentByIdempotencyKey(key: string): Promise<Payment | null> {
    const { data } = await this.db.from('payments').select(PAYMENT_COLUMNS).eq('idempotency_key', key).maybeSingle()
    return data ? toPayment(data as Row) : null
  }

  async getPaymentById(id: string): Promise<Payment | null> {
    const { data } = await this.db.from('payments').select(PAYMENT_COLUMNS).eq('id', id).maybeSingle()
    return data ? toPayment(data as Row) : null
  }

  async setMilestoneStatus(pactId: string, milestoneId: string, status: Milestone['status']): Promise<Milestone> {
    const { data, error } = await this.db
      .from('milestones')
      .update({ status })
      .eq('id', milestoneId)
      .eq('pact_id', pactId)
      .select(MILESTONE_COLUMNS)
      .maybeSingle()

    if (error) fail(error, 'Could not update that milestone.')
    if (!data) throw new RepoError('NOT_FOUND', 'That milestone does not exist.')
    return toMilestone(data as Row)
  }

  // --- deliverables -----------------------------------------------------------------

  async submitDeliverable(input: {
    pactId: string
    milestoneId: string | null
    submittedBy: string
    note: string
    link: string | null
  }): Promise<Deliverable> {
    if ((await this.roleOf(input.pactId, input.submittedBy)) !== 'PROVIDER') {
      throw new RepoError('NOT_ALLOWED', 'Only the provider submits deliverables.')
    }

    const { data, error } = await this.db
      .from('deliverables')
      .insert({
        pact_id: input.pactId,
        milestone_id: input.milestoneId,
        submitted_by: normalizeAddress(input.submittedBy),
        note: input.note,
        link: input.link,
        status: 'SUBMITTED',
      })
      .select('*')
      .single()

    if (error || !data) fail(error, 'Could not record that delivery.')
    if (input.milestoneId) await this.setMilestoneStatus(input.pactId, input.milestoneId, 'SUBMITTED')
    return toDeliverable(data as Row)
  }

  async reviewDeliverable(input: {
    deliverableId: string
    actor: string
    status: Deliverable['status']
    reviewNote: string | null
  }): Promise<Deliverable> {
    const { data: found } = await this.db
      .from('deliverables')
      .select('pact_id, milestone_id')
      .eq('id', input.deliverableId)
      .maybeSingle()
    if (!found) throw new RepoError('NOT_FOUND', 'That delivery does not exist.')

    const pactId = str(found.pact_id)
    if ((await this.roleOf(pactId, input.actor)) !== 'CLIENT') {
      throw new RepoError('NOT_ALLOWED', 'Only the client reviews a delivery.')
    }

    const { data, error } = await this.db
      .from('deliverables')
      .update({ status: input.status, review_note: input.reviewNote })
      .eq('id', input.deliverableId)
      .select('*')
      .single()
    if (error || !data) fail(error, 'Could not record that review.')

    const milestoneId = nullable(found.milestone_id)
    if (milestoneId && input.status === 'APPROVED') await this.setMilestoneStatus(pactId, milestoneId, 'APPROVED')
    if (milestoneId && input.status === 'CHANGES_REQUESTED') await this.setMilestoneStatus(pactId, milestoneId, 'IN_PROGRESS')

    return toDeliverable(data as Row)
  }

  // --- negotiation ------------------------------------------------------------------

  async openNegotiation(input: {
    pactId: string
    proposedBy: string
    message: string
    changes: Array<Omit<NegotiationChange, 'id' | 'negotiationId'>>
  }): Promise<Negotiation> {
    await this.roleOf(input.pactId, input.proposedBy)

    const { data, error } = await this.db
      .from('negotiations')
      .insert({
        pact_id: input.pactId,
        proposed_by: normalizeAddress(input.proposedBy),
        message: input.message,
        status: 'OPEN',
      })
      .select('*')
      .single()

    // A partial unique index allows only one OPEN proposal per agreement.
    if (error?.code === '23505') {
      throw new RepoError('CONFLICT', 'There is already an open proposal on this agreement.')
    }
    if (error || !data) fail(error, 'Could not record that proposal.')

    const negotiationId = str(data.id)
    if (input.changes.length > 0) {
      const { error: changeError } = await this.db.from('negotiation_changes').insert(
        input.changes.map((change) => ({
          negotiation_id: negotiationId,
          field: change.field,
          label: change.label,
          original_value: change.originalValue,
          proposed_value: change.proposedValue,
        })),
      )
      if (changeError) {
        await this.db.from('negotiations').delete().eq('id', negotiationId)
        fail(changeError, 'Could not record those changes.')
      }
    }

    return {
      id: negotiationId,
      pactId: input.pactId,
      proposedBy: normalizeAddress(input.proposedBy),
      message: input.message,
      status: 'OPEN',
      changes: input.changes.map((change, index) => ({ ...change, id: `${negotiationId}-${index}`, negotiationId })),
      createdAt: str(data.created_at),
      resolvedAt: null,
    }
  }

  async resolveNegotiation(input: {
    negotiationId: string
    actor: string
    status: Negotiation['status']
  }): Promise<Negotiation> {
    const { data: found } = await this.db
      .from('negotiations')
      .select('*, negotiation_changes(*)')
      .eq('id', input.negotiationId)
      .maybeSingle()
    if (!found) throw new RepoError('NOT_FOUND', 'That proposal does not exist.')

    const pactId = str(found.pact_id)
    await this.roleOf(pactId, input.actor)

    if (str(found.status) !== 'OPEN') throw new RepoError('CONFLICT', 'That proposal has already been answered.')
    if (normalizeAddress(str(found.proposed_by)) === normalizeAddress(input.actor) && input.status !== 'WITHDRAWN') {
      throw new RepoError('NOT_ALLOWED', 'The other side has to answer your proposal.')
    }

    const { error } = await this.db
      .from('negotiations')
      .update({ status: input.status, resolved_at: new Date().toISOString() })
      .eq('id', input.negotiationId)
    if (error) fail(error, 'Could not answer that proposal.')

    return {
      id: input.negotiationId,
      pactId,
      proposedBy: str(found.proposed_by),
      message: str(found.message),
      status: input.status,
      changes: ((found.negotiation_changes as Row[]) ?? []).map((change) => ({
        id: str(change.id),
        negotiationId: input.negotiationId,
        field: str(change.field),
        label: str(change.label),
        originalValue: str(change.original_value),
        proposedValue: str(change.proposed_value),
      })),
      createdAt: str(found.created_at),
      resolvedAt: new Date().toISOString(),
    }
  }

  // --- supporting records -----------------------------------------------------------

  async addActivity(input: {
    pactId: string
    kind: ActivityKind
    actorAddress: string | null
    actorName: string
    summary: string
    meta?: Record<string, string | number | null>
  }): Promise<Activity> {
    const { data, error } = await this.db
      .from('activities')
      .insert({
        pact_id: input.pactId,
        kind: input.kind,
        actor_address: input.actorAddress ? normalizeAddress(input.actorAddress) : null,
        actor_name: input.actorName,
        summary: input.summary,
        meta: input.meta ?? {},
      })
      .select('*')
      .single()

    if (error || !data) fail(error, 'Could not record that activity.')
    return toActivity(data as Row)
  }

  async createInvitation(input: { pactId: string; role: ParticipantRole; createdBy: string }): Promise<Invitation> {
    const token = crypto.randomUUID().replace(/-/g, '')
    const { data, error } = await this.db
      .from('invitations')
      .insert({
        pact_id: input.pactId,
        token,
        role: input.role,
        created_by: normalizeAddress(input.createdBy),
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('*')
      .single()

    if (error || !data) fail(error, 'Could not create that invitation.')
    return toInvitation(data as Row)
  }

  async getInvitationByToken(token: string): Promise<Invitation | null> {
    const { data } = await this.db.from('invitations').select('*').eq('token', token).maybeSingle()
    return data ? toInvitation(data as Row) : null
  }

  async acceptInvitation(token: string, address: string): Promise<Invitation> {
    const invitation = await this.getInvitationByToken(token)
    if (!invitation) throw new RepoError('NOT_FOUND', 'That invitation is not valid.')
    if (new Date(invitation.expiresAt).getTime() < Date.now()) {
      throw new RepoError('CONFLICT', 'That invitation has expired.')
    }

    await this.ensureUser(address)
    const { data, error } = await this.db
      .from('invitations')
      .update({ accepted_at: new Date().toISOString(), accepted_by: normalizeAddress(address) })
      .eq('token', token)
      .select('*')
      .single()

    if (error || !data) fail(error, 'Could not accept that invitation.')
    return toInvitation(data as Row)
  }

  /** See Repository.updateProfile. */
  async updateProfile(address: string, displayName: string): Promise<void> {
    const normalized = await this.ensureUser(address)
    // Not routed through ensureUser's own displayName param: that upsert is skipped for
    // a falsy name (existing callers only ever pass a name they already have), but an
    // explicit profile edit must be able to write exactly what was typed.
    const { error } = await this.db
      .from('profiles')
      .upsert({ address: normalized, display_name: displayName }, { onConflict: 'address' })
    if (error) fail(error, 'Could not update your profile.')
  }

  /**
   * Trust, computed from rows rather than stored.
   *
   * The view supplies the agreement counts; payments and on-time deliveries are counted
   * here because both need the "only if it can be evidenced" rule applied — a payment
   * without a transaction reference, or a delivery without a due date to compare
   * against, contributes nothing.
   */
  async getTrustMetrics(address: string): Promise<TrustMetrics> {
    const wanted = normalizeAddress(address)

    const [summary, payments, memberships] = await Promise.all([
      this.db.from('trust_metrics').select('*').eq('address', wanted).maybeSingle(),
      this.db
        .from('payments')
        .select('amount_minor::text, currency, status, tx_reference, from_address, to_address')
        .eq('status', 'CONFIRMED')
        .or(`from_address.eq.${wanted},to_address.eq.${wanted}`),
      this.db.from('pact_participants').select('pact_id, role, display_name').eq('address', wanted),
    ])

    const metrics: TrustMetrics = {
      address: wanted,
      displayName: str(summary.data?.display_name),
      pactsCompleted: Number(summary.data?.pacts_completed ?? 0),
      pactsActive: Number(summary.data?.pacts_active ?? 0),
      pactsCancelled: Number(summary.data?.pacts_cancelled ?? 0),
      paymentsConfirmed: 0,
      deliveredOnTime: 0,
      deliveredTotal: 0,
      totalValueByCurrency: {},
      firstSeenAt: nullable(summary.data?.first_seen_at),
    }

    for (const row of (payments.data ?? []) as Row[]) {
      if (!row.tx_reference) continue // nothing to point at means nothing to count
      metrics.paymentsConfirmed += 1
      const currency = str(row.currency) as Payment['currency']
      metrics.totalValueByCurrency[currency] = sumMinor([
        metrics.totalValueByCurrency[currency] ?? '0',
        str(row.amount_minor),
      ])
    }

    const providerPacts = ((memberships.data ?? []) as Row[])
      .filter((row) => str(row.role) === 'PROVIDER')
      .map((row) => str(row.pact_id))

    if (providerPacts.length > 0) {
      const [deliverables, milestones, pacts] = await Promise.all([
        this.db.from('deliverables').select('*').in('pact_id', providerPacts).eq('status', 'APPROVED'),
        this.db.from('milestones').select('id, due_date').in('pact_id', providerPacts),
        this.db.from('pacts').select('id, deadline').in('id', providerPacts),
      ])

      const milestoneDue = new Map(((milestones.data ?? []) as Row[]).map((m) => [str(m.id), nullable(m.due_date)]))
      const pactDue = new Map(((pacts.data ?? []) as Row[]).map((p) => [str(p.id), nullable(p.deadline)]))

      for (const row of (deliverables.data ?? []) as Row[]) {
        metrics.deliveredTotal += 1
        const due = milestoneDue.get(str(row.milestone_id)) ?? pactDue.get(str(row.pact_id)) ?? null
        if (!due || str(row.created_at).slice(0, 10) <= due.slice(0, 10)) metrics.deliveredOnTime += 1
      }
    }

    return metrics
  }

  // --- notifications ----------------------------------------------------------------

  async listNotifications(address: string): Promise<Notification[]> {
    const { data } = await this.db
      .from('notifications')
      .select('*')
      .eq('address', normalizeAddress(address))
      .order('created_at', { ascending: false })
    return ((data ?? []) as Row[]).map(toNotification)
  }

  async markNotificationRead(id: string, address: string): Promise<void> {
    await this.db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('address', normalizeAddress(address))
  }

  /**
   * Derive the nudges this user should see.
   *
   * Deduplication is the database's job: `one_nudge_per_reason` is a unique constraint on
   * (address, pact_id, kind), so an insert that would repeat a nudge is simply ignored.
   * That is why this can run on every poll without spamming anyone.
   */
  async refreshNotifications(address: string): Promise<Notification[]> {
    const wanted = normalizeAddress(address)
    const pacts = await this.listPactsForAddress(wanted)

    const today = new Date()
    const inThreeDays = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)
    const candidates: Row[] = []

    const add = (pactId: string, kind: Notification['kind'], title: string, body: string) => {
      candidates.push({ address: wanted, pact_id: pactId, kind, title, body, sent_at: new Date().toISOString() })
    }

    for (const pact of pacts) {
      const self = pact.participants.find((p) => p.address && normalizeAddress(p.address) === wanted)
      if (!self || isTerminal(pact.status)) continue

      if (pact.status === 'PENDING' && normalizeAddress(pact.createdBy) !== wanted) {
        add(pact.id, 'ACCEPTANCE_PENDING', 'Waiting on you', `${pact.title} needs your signature.`)
      }
      if (pact.deadline) {
        const due = new Date(pact.deadline)
        if (due < today) add(pact.id, 'OVERDUE', 'Past its deadline', `${pact.title} was due ${pact.deadline}.`)
        else if (due <= inThreeDays) add(pact.id, 'DEADLINE_APPROACHING', 'Due soon', `${pact.title} is due ${pact.deadline}.`)
      }
    }

    if (candidates.length > 0) {
      // ignoreDuplicates leans on the unique constraint instead of a read-then-write race.
      await this.db.from('notifications').upsert(candidates, {
        onConflict: 'address,pact_id,kind',
        ignoreDuplicates: true,
      })
    }

    return this.listNotifications(wanted)
  }
}

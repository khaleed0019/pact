import { shortIdFromDigest, termsDigest, type CanonicalTerms } from '../pact/digest.ts'
import { toMinor } from '../pact/money.ts'
import type {
  Activity,
  ActivityKind,
  Currency,
  Deliverable,
  EvmChainKey,
  Milestone,
  Negotiation,
  PactDetail,
  PactStatus,
  Participant,
  ParticipantRole,
  Payment,
} from '../pact/types.ts'

/**
 * Demo mode.
 *
 * Three scenarios that between them exercise the entire lifecycle: create, negotiate,
 * accept, seal, pay, deliver, review, complete. A judge who opens PACT outside Nimiq Pay
 * — or before creating anything — lands in a product that already has a history, rather
 * than in an empty state that demonstrates nothing.
 *
 * These are clearly labelled as demo data in the UI. Nothing here is presented as real
 * on-chain activity: the transaction references are marked `demo:` precisely so they can
 * never be mistaken for, or rendered as, links to a block explorer.
 */

/**
 * Demo EVM addresses.
 *
 * USDT settles against an EVM address, so seeded participants need one or the demo can
 * never reach a payment screen. These are deterministic placeholders, clearly not in use
 * by anyone: the demo's transaction references are `demo:` prefixed and never rendered as
 * explorer links, so nothing here can be mistaken for real on-chain activity.
 */
export const DEMO_EVM_ADDRESSES = {
  khaleed: '0xd0c0000000000000000000000000000000000001',
  john: '0xd0c0000000000000000000000000000000000002',
  amara: '0xd0c0000000000000000000000000000000000003',
  studio: '0xd0c0000000000000000000000000000000000004',
} as const

export const DEMO_ADDRESSES = {
  khaleed: 'NQ34 248D KYPJ 2NGL FMEB U0RN 8DJ4 UVYL 4G7B',
  john: 'NQ26 8MMT 8317 VGNS AVBS HNSR L8B0 D3J1 2QFT',
  amara: 'NQ71 F2GD RE4S FS7A 4CQM 9V0J UVGS 3AQP U4L2',
  studio: 'NQ55 X4CJ 8YRA U38J 3GCH 4EG9 FEUS 5RKT 6D2H',
} as const

/** Dates are relative to "today" so the demo never looks stale on a later run. */
function dayOffset(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function timeOffset(days: number, hours = 0): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  date.setUTCHours(date.getUTCHours() + hours, 0, 0, 0)
  return date.toISOString()
}

interface SeedSpec {
  id: string
  title: string
  deliverable: string
  status: PactStatus
  currency: Currency
  chain: EvmChainKey | null
  amount: string
  deadline: string | null
  paymentCondition: string
  specialTerms: string[]
  client: { address: string; name: string; evm?: string }
  provider: { address: string | null; name: string; evm?: string }
  sealed: boolean
  milestones: Array<{
    title: string
    description: string
    amount: string
    percent: number
    dueDate: string | null
    status: Milestone['status']
  }>
  payments: Array<{
    milestoneIndex: number | null
    amount: string
    status: Payment['status']
    createdAt: string
    failureReason?: string
  }>
  deliverables: Array<{
    milestoneIndex: number | null
    note: string
    link: string | null
    status: Deliverable['status']
    reviewNote: string | null
    createdAt: string
  }>
  negotiations: Array<{
    proposedBy: string
    message: string
    status: Negotiation['status']
    createdAt: string
    changes: Array<{ field: string; label: string; originalValue: string; proposedValue: string }>
  }>
  activities: Array<{ kind: ActivityKind; actor: 'client' | 'provider'; summary: string; at: string; meta?: Record<string, string | number | null> }>
}

function build(spec: SeedSpec): PactDetail {
  const createdAt = timeOffset(-14)
  const idFor = (suffix: string) => `${spec.id}-${suffix}`

  const participants: Participant[] = [
    {
      id: idFor('p-client'),
      pactId: spec.id,
      role: 'CLIENT',
      address: spec.client.address.replace(/\s/g, ''),
      displayName: spec.client.name,
      evmAddress: spec.client.evm ?? null,
      sealSignature: spec.sealed ? `demo-signature-${spec.id}-client` : null,
      sealPublicKey: spec.sealed ? `demo-public-key-${spec.id}-client` : null,
      sealedAt: spec.sealed ? timeOffset(-13) : null,
      joinedAt: createdAt,
    },
    {
      id: idFor('p-provider'),
      pactId: spec.id,
      role: 'PROVIDER',
      address: spec.provider.address ? spec.provider.address.replace(/\s/g, '') : null,
      displayName: spec.provider.name,
      evmAddress: spec.provider.evm ?? null,
      sealSignature: spec.sealed ? `demo-signature-${spec.id}-provider` : null,
      sealPublicKey: spec.sealed ? `demo-public-key-${spec.id}-provider` : null,
      sealedAt: spec.sealed ? timeOffset(-13) : null,
      joinedAt: spec.provider.address ? timeOffset(-13) : null,
    },
  ]

  const milestones: Milestone[] = spec.milestones.map((m, index) => ({
    id: idFor(`m${index + 1}`),
    pactId: spec.id,
    position: index + 1,
    title: m.title,
    description: m.description,
    amountMinor: m.amount,
    percent: m.percent,
    dueDate: m.dueDate,
    status: m.status,
    createdAt,
    updatedAt: createdAt,
  }))

  const canonical: CanonicalTerms = {
    title: spec.title,
    deliverable: spec.deliverable,
    currency: spec.currency,
    chain: spec.chain,
    totalAmountMinor: spec.amount,
    deadline: spec.deadline,
    paymentCondition: spec.paymentCondition,
    specialTerms: spec.specialTerms,
    participants: participants.map((p) => ({ role: p.role, displayName: p.displayName, address: p.address })),
    milestones: milestones.map((m) => ({
      position: m.position,
      title: m.title,
      amountMinor: m.amountMinor,
      dueDate: m.dueDate,
    })),
  }
  const digest = termsDigest(canonical)

  const addressOf = (role: ParticipantRole) => participants.find((p) => p.role === role)?.address ?? null
  const nameOf = (role: ParticipantRole) => participants.find((p) => p.role === role)?.displayName ?? ''

  const payments: Payment[] = spec.payments.map((p, index) => ({
    id: idFor(`pay${index + 1}`),
    pactId: spec.id,
    milestoneId: p.milestoneIndex === null ? null : milestones[p.milestoneIndex].id,
    fromAddress: addressOf('CLIENT') ?? '',
    toAddress: addressOf('PROVIDER') ?? '',
    amountMinor: p.amount,
    currency: spec.currency,
    chain: spec.chain,
    status: p.status,
    // Prefixed so nothing in the UI can ever render this as a real explorer link.
    txReference: p.status === 'CONFIRMED' || p.status === 'SUBMITTED' ? `demo:${spec.id}:${index + 1}` : null,
    memo: spec.currency === 'NIM' ? `PACT:${shortIdFromDigest(digest)}:m${(p.milestoneIndex ?? 0) + 1}` : null,
    failureReason: p.failureReason ?? null,
    idempotencyKey: idFor(`idem${index + 1}`),
    createdAt: p.createdAt,
    updatedAt: p.createdAt,
  }))

  const deliverables: Deliverable[] = spec.deliverables.map((d, index) => ({
    id: idFor(`d${index + 1}`),
    pactId: spec.id,
    milestoneId: d.milestoneIndex === null ? null : milestones[d.milestoneIndex].id,
    submittedBy: addressOf('PROVIDER') ?? '',
    note: d.note,
    link: d.link,
    status: d.status,
    reviewNote: d.reviewNote,
    createdAt: d.createdAt,
    updatedAt: d.createdAt,
  }))

  const negotiations: Negotiation[] = spec.negotiations.map((n, index) => ({
    id: idFor(`n${index + 1}`),
    pactId: spec.id,
    proposedBy: n.proposedBy.replace(/\s/g, ''),
    message: n.message,
    status: n.status,
    changes: n.changes.map((c, changeIndex) => ({
      ...c,
      id: idFor(`n${index + 1}c${changeIndex + 1}`),
      negotiationId: idFor(`n${index + 1}`),
    })),
    createdAt: n.createdAt,
    resolvedAt: n.status === 'OPEN' ? null : n.createdAt,
  }))

  const activities: Activity[] = spec.activities.map((a, index) => ({
    id: idFor(`a${index + 1}`),
    pactId: spec.id,
    kind: a.kind,
    actorAddress: addressOf(a.actor === 'client' ? 'CLIENT' : 'PROVIDER'),
    actorName: nameOf(a.actor === 'client' ? 'CLIENT' : 'PROVIDER'),
    summary: a.summary,
    meta: a.meta ?? {},
    createdAt: a.at,
  }))

  return {
    id: spec.id,
    shortId: shortIdFromDigest(digest),
    title: spec.title,
    deliverable: spec.deliverable,
    createdBy: addressOf('CLIENT') ?? '',
    status: spec.status,
    currency: spec.currency,
    chain: spec.chain,
    totalAmountMinor: spec.amount,
    deadline: spec.deadline,
    paymentCondition: spec.paymentCondition,
    specialTerms: spec.specialTerms,
    termsDigest: digest,
    participants,
    milestones,
    payments,
    deliverables,
    negotiations,
    activities,
    createdAt,
    updatedAt: timeOffset(-1),
  }
}

/** Scenario one — the headline story: a freelance website build, mid-flight. */
function websiteProject(): PactDetail {
  const total = toMinor('200', 'USDT')
  return build({
    id: 'demo-website',
    title: 'Marketing website design',
    deliverable: 'A five page marketing website, designed and delivered as a Figma file with source components',
    status: 'IN_PROGRESS',
    currency: 'USDT',
    chain: 'polygon',
    amount: total,
    deadline: dayOffset(6),
    paymentCondition: 'Half on start, half after the final design is approved',
    specialTerms: ['Two rounds of revisions included', 'Source files handed over on completion'],
    client: { address: DEMO_ADDRESSES.khaleed, name: 'Khaleed', evm: DEMO_EVM_ADDRESSES.khaleed },
    provider: { address: DEMO_ADDRESSES.john, name: 'John', evm: DEMO_EVM_ADDRESSES.john },
    sealed: true,
    milestones: [
      {
        title: 'Project start',
        description: 'Kick-off, brand review and wireframes agreed',
        amount: toMinor('100', 'USDT'),
        percent: 50,
        dueDate: dayOffset(-8),
        status: 'PAID',
      },
      {
        title: 'Final design approved',
        description: 'All five pages delivered and signed off',
        amount: toMinor('100', 'USDT'),
        percent: 50,
        dueDate: dayOffset(6),
        status: 'IN_PROGRESS',
      },
    ],
    payments: [{ milestoneIndex: 0, amount: toMinor('100', 'USDT'), status: 'CONFIRMED', createdAt: timeOffset(-9) }],
    deliverables: [
      {
        milestoneIndex: 0,
        note: 'Wireframes for all five pages are done and the brand review is written up.',
        link: 'https://example.com/demo/wireframes',
        status: 'APPROVED',
        reviewNote: 'Looks great, happy to proceed.',
        createdAt: timeOffset(-9, -3),
      },
    ],
    negotiations: [
      {
        proposedBy: DEMO_ADDRESSES.john,
        message: 'Could we move the deadline back a few days? I want to get the mobile layouts right.',
        status: 'ACCEPTED',
        createdAt: timeOffset(-12),
        changes: [{ field: 'deadline', label: 'Deadline', originalValue: dayOffset(1), proposedValue: dayOffset(6) }],
      },
    ],
    activities: [
      { kind: 'PACT_CREATED', actor: 'client', summary: 'Khaleed created this agreement', at: timeOffset(-14) },
      { kind: 'PACT_SENT', actor: 'client', summary: 'Sent to John for signature', at: timeOffset(-14, 1) },
      {
        kind: 'CHANGES_REQUESTED',
        actor: 'provider',
        summary: 'John proposed moving the deadline',
        at: timeOffset(-12),
      },
      { kind: 'CHANGES_ACCEPTED', actor: 'client', summary: 'Khaleed accepted the new deadline', at: timeOffset(-13) },
      { kind: 'PACT_SEALED', actor: 'provider', summary: 'Both sides signed the terms', at: timeOffset(-13, 2) },
      { kind: 'WORK_STARTED', actor: 'provider', summary: 'John started work', at: timeOffset(-12, 4) },
      {
        kind: 'DELIVERY_SUBMITTED',
        actor: 'provider',
        summary: 'Wireframes delivered for milestone 1',
        at: timeOffset(-9, -3),
      },
      { kind: 'DELIVERY_APPROVED', actor: 'client', summary: 'Khaleed approved milestone 1', at: timeOffset(-9, -1) },
      {
        kind: 'PAYMENT_CONFIRMED',
        actor: 'client',
        summary: 'Paid 100 USDT for Project start',
        at: timeOffset(-9),
        meta: { amount: '100 USDT', milestone: 'Project start' },
      },
    ],
  })
}

/** Scenario two — milestone-heavy, and waiting on the other side to sign. */
function videoEditing(): PactDetail {
  const total = toMinor('150', 'USDT')
  return build({
    id: 'demo-video',
    title: 'Edit 10 short-form videos',
    deliverable: '10 edited vertical videos, each under 60 seconds, colour graded with captions burned in',
    status: 'PENDING',
    currency: 'USDT',
    chain: 'polygon',
    amount: total,
    deadline: dayOffset(13),
    paymentCondition: 'Paid per milestone as batches are delivered',
    specialTerms: ['Raw footage supplied by the client', 'One round of revisions per video'],
    client: { address: DEMO_ADDRESSES.khaleed, name: 'Khaleed', evm: DEMO_EVM_ADDRESSES.khaleed },
    provider: { address: DEMO_ADDRESSES.amara, name: 'Amara', evm: DEMO_EVM_ADDRESSES.amara },
    sealed: false,
    milestones: [
      {
        title: 'First batch',
        description: 'Videos 1 to 4 delivered',
        amount: toMinor('60', 'USDT'),
        percent: 40,
        dueDate: dayOffset(4),
        status: 'PENDING',
      },
      {
        title: 'Second batch',
        description: 'Videos 5 to 8 delivered',
        amount: toMinor('60', 'USDT'),
        percent: 40,
        dueDate: dayOffset(9),
        status: 'PENDING',
      },
      {
        title: 'Final two and handover',
        description: 'Videos 9 and 10 plus all project files',
        amount: toMinor('30', 'USDT'),
        percent: 20,
        dueDate: dayOffset(13),
        status: 'PENDING',
      },
    ],
    payments: [],
    deliverables: [],
    negotiations: [],
    activities: [
      { kind: 'PACT_CREATED', actor: 'client', summary: 'Khaleed created this agreement', at: timeOffset(-2) },
      { kind: 'PACT_SENT', actor: 'client', summary: 'Sent to Amara for signature', at: timeOffset(-2, 1) },
    ],
  })
}

/** Scenario three — the simplest possible shape, paid in NIM, already finished. */
function digitalProduct(): PactDetail {
  const total = toMinor('850', 'NIM')
  return build({
    id: 'demo-product',
    title: 'Lightroom preset pack',
    deliverable: 'A pack of 24 Lightroom presets delivered as a download link',
    status: 'COMPLETED',
    currency: 'NIM',
    chain: null,
    amount: total,
    deadline: dayOffset(-3),
    paymentCondition: 'Paid on delivery',
    specialTerms: ['Personal licence, not for resale'],
    client: { address: DEMO_ADDRESSES.khaleed, name: 'Khaleed' },
    provider: { address: DEMO_ADDRESSES.studio, name: 'Northlight Studio' },
    sealed: true,
    milestones: [
      {
        title: 'Delivery',
        description: 'Download link sent and payment made',
        amount: total,
        percent: 100,
        dueDate: dayOffset(-3),
        status: 'PAID',
      },
    ],
    payments: [{ milestoneIndex: 0, amount: total, status: 'CONFIRMED', createdAt: timeOffset(-4) }],
    deliverables: [
      {
        milestoneIndex: 0,
        note: 'All 24 presets are in the link below, with the install guide.',
        link: 'https://example.com/demo/presets',
        status: 'APPROVED',
        reviewNote: 'Exactly what I wanted, thank you.',
        createdAt: timeOffset(-5),
      },
    ],
    negotiations: [],
    activities: [
      { kind: 'PACT_CREATED', actor: 'client', summary: 'Khaleed created this agreement', at: timeOffset(-7) },
      { kind: 'PACT_SEALED', actor: 'provider', summary: 'Both sides signed the terms', at: timeOffset(-6) },
      { kind: 'DELIVERY_SUBMITTED', actor: 'provider', summary: 'Preset pack delivered', at: timeOffset(-5) },
      { kind: 'DELIVERY_APPROVED', actor: 'client', summary: 'Khaleed approved the delivery', at: timeOffset(-4, -2) },
      {
        kind: 'PAYMENT_CONFIRMED',
        actor: 'client',
        summary: 'Paid 850 NIM',
        at: timeOffset(-4),
        meta: { amount: '850 NIM' },
      },
      { kind: 'PACT_COMPLETED', actor: 'client', summary: 'Agreement completed', at: timeOffset(-3) },
    ],
  })
}

export function demoPacts(): PactDetail[] {
  return [websiteProject(), videoEditing(), digitalProduct()]
}

/** The address demo mode signs you in as, so the seeded pacts are "yours". */
export const DEMO_VIEWER = {
  address: DEMO_ADDRESSES.khaleed.replace(/\s/g, ''),
  name: 'Khaleed',
}

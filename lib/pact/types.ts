/**
 * PACT domain types.
 *
 * These are the shapes the whole app agrees on. The database mirrors them, the API
 * routes validate against them (see `schema.ts`), and the UI renders them. Nothing
 * here knows about React, Supabase, or the Nimiq provider.
 */

export const PACT_STATUSES = [
  'DRAFT',
  'PENDING',
  'NEGOTIATING',
  'ACTIVE',
  'IN_PROGRESS',
  'DELIVERED',
  'COMPLETED',
  'DISPUTED',
  'DECLINED',
  'CANCELLED',
] as const
export type PactStatus = (typeof PACT_STATUSES)[number]

/** Assets PACT can actually move, given what the framework exposes. */
export const CURRENCIES = ['NIM', 'USDT'] as const
export type Currency = (typeof CURRENCIES)[number]

/**
 * Chains USDT can be sent on. Values are the EIP-155 chainId in hex, exactly as
 * `wallet_switchEthereumChain` and `eth_chainId` expect them.
 */
export const EVM_CHAINS = {
  polygon: {
    chainId: '0x89',
    name: 'Polygon',
    nativeSymbol: 'POL',
    usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    explorer: 'https://polygonscan.com/tx/',
  },
  ethereum: {
    chainId: '0x1',
    name: 'Ethereum',
    nativeSymbol: 'ETH',
    usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    explorer: 'https://etherscan.io/tx/',
  },
  arbitrum: {
    chainId: '0xa4b1',
    name: 'Arbitrum One',
    nativeSymbol: 'ETH',
    usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    explorer: 'https://arbiscan.io/tx/',
  },
  optimism: {
    chainId: '0xa',
    name: 'Optimism',
    nativeSymbol: 'ETH',
    usdt: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    explorer: 'https://optimistic.etherscan.io/tx/',
  },
} as const
export type EvmChainKey = keyof typeof EVM_CHAINS

/** USDT and USDC are 6 decimals on every supported chain. NIM is 5 (Luna). */
export const DECIMALS: Record<Currency, number> = { NIM: 5, USDT: 6 }

export type ParticipantRole = 'CLIENT' | 'PROVIDER'

export interface Participant {
  id: string
  pactId: string
  role: ParticipantRole
  /** Nimiq address, derived server-side from a signature. Null until they join. */
  address: string | null
  /** Display name typed by whoever created the pact, before the other side joins. */
  displayName: string
  /** Their EVM address, captured when they first pay or receive in USDT. */
  evmAddress: string | null
  /** Ed25519 signature over `termsDigest`, proving they agreed to these exact terms. */
  sealSignature: string | null
  sealPublicKey: string | null
  sealedAt: string | null
  joinedAt: string | null
}

export const MILESTONE_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'SUBMITTED',
  'APPROVED',
  'PAID',
  'CANCELLED',
] as const
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

export interface Milestone {
  id: string
  pactId: string
  position: number
  title: string
  description: string
  /** Minor units (Luna for NIM, 1e-6 for USDT). Never a float. */
  amountMinor: string
  /** Percentage of the pact total, kept for display so rounding never drifts. */
  percent: number
  dueDate: string | null
  status: MilestoneStatus
  createdAt: string
  updatedAt: string
}

export const PAYMENT_STATUSES = ['PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export interface Payment {
  id: string
  pactId: string
  milestoneId: string | null
  fromAddress: string
  toAddress: string
  amountMinor: string
  currency: Currency
  chain: EvmChainKey | null
  status: PaymentStatus
  /**
   * For NIM: the serialized transaction returned by `sendBasicTransaction*`.
   * For USDT: the transaction hash returned by `eth_sendTransaction`.
   */
  txReference: string | null
  /** The on-chain memo we wrote, e.g. `PACT:ab12cd34:m1`. NIM only. */
  memo: string | null
  /** Why a payment failed or was cancelled, in the user's words not the chain's. */
  failureReason: string | null
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

export const DELIVERABLE_STATUSES = ['SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED'] as const
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number]

export interface Deliverable {
  id: string
  pactId: string
  milestoneId: string | null
  submittedBy: string
  note: string
  /** Optional external link (a Figma file, a Drive folder, a repo). */
  link: string | null
  status: DeliverableStatus
  reviewNote: string | null
  createdAt: string
  updatedAt: string
}

export const NEGOTIATION_STATUSES = ['OPEN', 'ACCEPTED', 'DECLINED', 'COUNTERED', 'WITHDRAWN'] as const
export type NegotiationStatus = (typeof NEGOTIATION_STATUSES)[number]

/** One field the proposer wants changed, with both sides recorded for the diff view. */
export interface NegotiationChange {
  id: string
  negotiationId: string
  field: string
  label: string
  originalValue: string
  proposedValue: string
}

export interface Negotiation {
  id: string
  pactId: string
  proposedBy: string
  message: string
  status: NegotiationStatus
  changes: NegotiationChange[]
  createdAt: string
  resolvedAt: string | null
}

export type ActivityKind =
  | 'PACT_CREATED'
  | 'PACT_SENT'
  | 'TERMS_ACCEPTED'
  | 'PACT_SEALED'
  | 'CHANGES_REQUESTED'
  | 'CHANGES_ACCEPTED'
  | 'PACT_DECLINED'
  | 'WORK_STARTED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'DELIVERY_SUBMITTED'
  | 'DELIVERY_APPROVED'
  | 'MILESTONE_COMPLETED'
  | 'PACT_COMPLETED'
  | 'PACT_CANCELLED'
  | 'ISSUE_RAISED'

export interface Activity {
  id: string
  pactId: string
  kind: ActivityKind
  actorAddress: string | null
  actorName: string
  summary: string
  /** Anything worth showing on the timeline row: amounts, tx refs, milestone names. */
  meta: Record<string, string | number | null>
  createdAt: string
}

export interface Pact {
  id: string
  /** Short, shareable, human-typable. Used in invite links and the on-chain memo. */
  shortId: string
  title: string
  deliverable: string
  createdBy: string
  status: PactStatus
  currency: Currency
  chain: EvmChainKey | null
  totalAmountMinor: string
  deadline: string | null
  paymentCondition: string
  specialTerms: string[]
  /** Blake2b digest of the canonical terms. What both parties actually sign. */
  termsDigest: string
  participants: Participant[]
  milestones: Milestone[]
  createdAt: string
  updatedAt: string
}

/** A pact plus everything the detail screen needs, in one round trip. */
export interface PactDetail extends Pact {
  payments: Payment[]
  deliverables: Deliverable[]
  negotiations: Negotiation[]
  activities: Activity[]
}

export interface TrustMetrics {
  address: string
  displayName: string
  pactsCompleted: number
  pactsActive: number
  pactsCancelled: number
  paymentsConfirmed: number
  /** Numerator and denominator are both exposed so the UI never shows a bare %. */
  deliveredOnTime: number
  deliveredTotal: number
  totalValueByCurrency: Partial<Record<Currency, string>>
  firstSeenAt: string | null
}

export interface Invitation {
  id: string
  pactId: string
  token: string
  role: ParticipantRole
  createdBy: string
  expiresAt: string
  acceptedAt: string | null
  acceptedBy: string | null
}

export type NotificationKind =
  | 'ACCEPTANCE_PENDING'
  | 'DEADLINE_APPROACHING'
  | 'MILESTONE_DUE'
  | 'DELIVERY_AWAITING_REVIEW'
  | 'PAYMENT_DUE'
  | 'NEGOTIATION_AWAITING_REPLY'
  | 'OVERDUE'

export interface Notification {
  id: string
  address: string
  pactId: string
  kind: NotificationKind
  title: string
  body: string
  /** Set once delivered so the reminder scan never sends the same nudge twice. */
  sentAt: string | null
  readAt: string | null
  createdAt: string
}

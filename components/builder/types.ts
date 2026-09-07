import type { Currency, EvmChainKey, ParticipantRole } from '@/lib/pact/types'
import type { Ambiguity } from '@/lib/ai/schema'

/**
 * The Builder's working draft.
 *
 * Amounts are held as the *display string* the user typed rather than as minor units.
 * Converting on every keystroke would fight the user — you cannot type "1.5" if "1."
 * is rejected the moment it exists. Conversion happens once, on submit, where a bad
 * value can be reported against the field it came from.
 */
export interface Draft {
  title: string
  deliverable: string
  creatorRole: ParticipantRole
  creatorName: string
  counterpartyName: string
  counterpartyAddress: string
  currency: Currency
  chain: EvmChainKey | null
  amount: string
  deadline: string
  paymentCondition: string
  specialTerms: string[]
  milestones: DraftMilestone[]
}

export interface DraftMilestone {
  title: string
  description: string
  percent: number
  dueDate: string
}

export const EMPTY_DRAFT: Draft = {
  title: '',
  deliverable: '',
  creatorRole: 'CLIENT',
  creatorName: '',
  counterpartyName: '',
  counterpartyAddress: '',
  currency: 'USDT',
  chain: 'polygon',
  amount: '',
  deadline: '',
  paymentCondition: '',
  specialTerms: [],
  milestones: [],
}

export interface ReviewState {
  ambiguities: Ambiguity[]
  verdict: string
  source: 'model' | 'heuristic'
}

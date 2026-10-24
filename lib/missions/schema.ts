import { z } from 'zod'
import { LIMITS, MISSION_TOOLS } from './model.ts'

/**
 * Request validation for mission routes. Every field bounded before it reaches the
 * service; budget and deadline are validated here and nothing downstream can change them.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-05.')

export const createMissionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  brief: z.string().trim().min(10, 'Describe the job in a sentence or two.').max(2000),
  budgetNear: z.string().trim().regex(/^\d{1,6}(\.\d{1,6})?$/, 'Enter a NEAR amount like 0.5 (at most 6 decimals).'),
  deadline: isoDate,
  acceptanceCriteria: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
  allowedTools: z.array(z.enum(MISSION_TOOLS)).min(1).max(MISSION_TOOLS.length),
  allowProviderRecipient: z.boolean(),
})

export const editPlanSchema = z.object({
  keywords: z.array(z.string().trim().min(2).max(40)).min(1).max(LIMITS.maxKeywords).optional(),
  targetCount: z.number().int().min(1).max(LIMITS.maxTargetCount).optional(),
  removeStepIds: z.array(z.string().max(10)).max(12).optional(),
})

export const approveSchema = z.object({ fingerprint: z.string().regex(/^[0-9a-f]{64}$/) })

export const reviewSchema = z.object({ decision: z.enum(['ACCEPT', 'REJECT']), note: z.string().trim().max(500).default('') })

export const submitPaymentSchema = z.object({
  txHash: z.string().trim().min(40).max(50),
  payer: z.string().trim().min(2).max(64),
})

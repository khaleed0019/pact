import { isTestnetAccountId } from '../near/config.ts'
import { nearToYocto } from '../near/amount.ts'
import type { Provider } from './model.ts'

/**
 * The one provider: PACT's own research agent, run by whoever operates this deployment.
 *
 * Price and payout account come from server configuration — never from a model, never
 * from the browser. An unset or malformed payout account leaves `payoutAccount` null,
 * and the policy engine then refuses every payment rather than guessing a recipient.
 */
export function providerFromEnv(env: Record<string, string | undefined> = process.env): Provider {
  const account = env.PACT_PROVIDER_NEAR_ACCOUNT?.trim() ?? ''
  let priceYocto: string
  try {
    priceYocto = nearToYocto(env.PACT_PROVIDER_PRICE_NEAR?.trim() || '0.1')
  } catch {
    priceYocto = nearToYocto('0.1')
  }
  return {
    id: 'pact-research-agent',
    name: 'PACT Research Agent',
    operator: 'The operator of this PACT deployment',
    tools: ['hn_hiring_search', 'compile_leads', 'acceptance_check'],
    priceYocto,
    payoutAccount: account && isTestnetAccountId(account) ? account : null,
  }
}

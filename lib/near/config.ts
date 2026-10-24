/**
 * Which NEAR network PACT talks to, and where.
 *
 * Testnet only. Missions are a hackathon-stage feature and PACT does not move or verify
 * real-money NEAR until a production workflow has been separately reviewed and switched
 * on — there is deliberately no mainnet value here to flip by accident.
 *
 * The public `rpc.testnet.near.org` endpoint now answers with a deprecation error and a
 * 429 under any real use (observed 2026-10-24), so the default is FastNEAR's free
 * testnet RPC, which the official NEAR RPC docs use in their own examples. It is rate
 * limited too; set `NEAR_RPC_URL` to a keyed provider for anything beyond a demo.
 */

export type NearNetwork = 'testnet'

export interface NearConfig {
  network: NearNetwork
  rpcUrl: string
  explorerTxUrl: (hash: string) => string
}

export const DEFAULT_NEAR_RPC_URL = 'https://test.rpc.fastnear.com'

export function nearConfig(env: Record<string, string | undefined> = process.env): NearConfig {
  return {
    network: 'testnet',
    rpcUrl: env.NEAR_RPC_URL || DEFAULT_NEAR_RPC_URL,
    explorerTxUrl: (hash) => `https://testnet.nearblocks.io/txns/${encodeURIComponent(hash)}`,
  }
}

/**
 * A NEAR account id, by the protocol's own rules: 2–64 chars of lowercase letters,
 * digits and `-_` separated by dots, or a 64-hex implicit account. Testnet named
 * accounts end in `.testnet`.
 */
const NAMED = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
const IMPLICIT = /^[0-9a-f]{64}$/

export function isNearAccountId(value: string): boolean {
  return NAMED.test(value) || IMPLICIT.test(value)
}

/** Testnet accepts implicit accounts and `*.testnet` names; a mainnet name is refused. */
export function isTestnetAccountId(value: string): boolean {
  return IMPLICIT.test(value) || (NAMED.test(value) && value.endsWith('.testnet'))
}

/** A NEAR transaction hash is 32 bytes in base58: 43 or 44 characters, no 0/O/I/l. */
export function isNearTxHash(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(value)
}

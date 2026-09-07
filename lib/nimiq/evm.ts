'use client'

import { EVM_CHAINS, type EvmChainKey } from '../pact/types.ts'
import { PactError, toPactError } from '../errors.ts'

/**
 * USDT payments through the EVM provider Nimiq Pay injects.
 *
 * Three facts from the framework docs drive everything here, and each one is a bug
 * waiting to happen if you assume otherwise:
 *
 *  1. **USDT is 6 decimals, not 18.** Treating it as 18 sends a millionth of the
 *     intended amount. PACT never converts here — it receives minor units that
 *     `lib/pact/money.ts` produced from the currency's real decimal count.
 *  2. **Gas is paid in the chain's native coin**, not in USDT. A user with 500 USDT and
 *     no POL cannot pay on Polygon. We check that before asking them to sign, so the
 *     failure arrives as advice rather than as a rejected transaction.
 *  3. **`to` is the token contract, not the recipient.** The recipient is an argument
 *     inside the encoded call data.
 */

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>
}

function getEthereum(): Eip1193Provider {
  const provider = (globalThis as { ethereum?: Eip1193Provider }).ethereum
  if (!provider) throw new PactError('NOT_IN_NIMIQ_PAY', 'No EVM provider injected.')
  return provider
}

export function hasEvmProvider(): boolean {
  return typeof globalThis !== 'undefined' && (globalThis as { ethereum?: unknown }).ethereum !== undefined
}

// --- ABI encoding -------------------------------------------------------------------
// Hand-rolled rather than pulling in ethers/viem. We need exactly two function calls,
// and a 200KB dependency inside a mobile WebView is a real cost for a real user.

/** keccak256("transfer(address,uint256)")[0..4] */
const TRANSFER_SELECTOR = '0xa9059cbb'
/** keccak256("balanceOf(address)")[0..4] */
const BALANCE_OF_SELECTOR = '0x70a08231'

function padHex(value: string): string {
  const clean = value.replace(/^0x/, '').toLowerCase()
  if (clean.length > 64) throw new PactError('VALIDATION', 'ABI argument does not fit in 32 bytes.')
  return clean.padStart(64, '0')
}

function toHexQuantity(value: bigint): string {
  return `0x${value.toString(16)}`
}

export function encodeTransfer(recipient: string, amountMinor: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    throw new PactError('VALIDATION', 'Recipient must be a 20-byte EVM address.')
  }
  return `${TRANSFER_SELECTOR}${padHex(recipient)}${padHex(BigInt(amountMinor).toString(16))}`
}

export function encodeBalanceOf(owner: string): string {
  return `${BALANCE_OF_SELECTOR}${padHex(owner)}`
}

// --- provider operations ------------------------------------------------------------

export async function connectEvm(): Promise<string> {
  try {
    const accounts = (await getEthereum().request({ method: 'eth_requestAccounts' })) as string[]
    if (!Array.isArray(accounts) || accounts.length === 0) throw new PactError('NO_ACCOUNTS')
    return accounts[0]
  } catch (cause) {
    throw toPactError(cause)
  }
}

export async function getChainId(): Promise<string> {
  const chainId = (await getEthereum().request({ method: 'eth_chainId' })) as string
  return chainId.toLowerCase()
}

/**
 * Put the wallet on the chain this pact settles on.
 *
 * `wallet_switchEthereumChain` rejects with 4902 when the wallet has never heard of the
 * chain. PACT does **not** then call `wallet_addEthereumChain`: silently teaching a
 * user's wallet about a new network in order to take a payment is not a decision a Mini
 * App should make for them. We surface it and let them choose another network instead.
 */
export async function ensureChain(chain: EvmChainKey): Promise<void> {
  const target = EVM_CHAINS[chain].chainId.toLowerCase()
  if ((await getChainId()) === target) return

  try {
    await getEthereum().request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: EVM_CHAINS[chain].chainId }],
    })
  } catch (cause) {
    const code = (cause as { code?: number }).code
    if (code === 4902) throw new PactError('CHAIN_NOT_ADDED', EVM_CHAINS[chain].name)
    throw toPactError(cause)
  }

  if ((await getChainId()) !== target) throw new PactError('WRONG_CHAIN', EVM_CHAINS[chain].name)
}

async function ethCall(to: string, data: string): Promise<string> {
  return (await getEthereum().request({ method: 'eth_call', params: [{ to, data }, 'latest'] })) as string
}

/** USDT balance in minor units (6dp), read-only — no wallet prompt. */
export async function readUsdtBalance(chain: EvmChainKey, owner: string): Promise<string> {
  const raw = await ethCall(EVM_CHAINS[chain].usdt, encodeBalanceOf(owner))
  return BigInt(raw === '0x' ? '0x0' : raw).toString()
}

/** Native-coin balance in wei — what actually pays for gas. */
export async function readNativeBalance(owner: string): Promise<bigint> {
  const raw = (await getEthereum().request({ method: 'eth_getBalance', params: [owner, 'latest'] })) as string
  return BigInt(raw === '0x' ? '0x0' : raw)
}

export interface UsdtPreflight {
  ok: boolean
  usdtBalanceMinor: string
  nativeBalanceWei: string
  /** Which check failed, so the UI can say the useful thing rather than "error". */
  problem: 'NONE' | 'INSUFFICIENT_USDT' | 'NO_GAS'
}

/**
 * Check the two things that make a USDT transfer fail *before* prompting the wallet.
 * Being told "you need POL for fees" up front is a completely different experience from
 * signing, waiting, and getting a rejection.
 */
export async function preflightUsdt(input: {
  chain: EvmChainKey
  from: string
  amountMinor: string
}): Promise<UsdtPreflight> {
  const [usdt, native] = await Promise.all([
    readUsdtBalance(input.chain, input.from),
    readNativeBalance(input.from),
  ])

  const problem: UsdtPreflight['problem'] =
    BigInt(usdt) < BigInt(input.amountMinor) ? 'INSUFFICIENT_USDT' : native === 0n ? 'NO_GAS' : 'NONE'

  return {
    ok: problem === 'NONE',
    usdtBalanceMinor: usdt,
    nativeBalanceWei: native.toString(),
    problem,
  }
}

/**
 * Send USDT. Returns the transaction hash.
 *
 * A hash means *submitted*, not *settled* — the caller records it and the server only
 * moves the payment to CONFIRMED once a receipt with a success status comes back.
 */
export async function sendUsdt(input: {
  chain: EvmChainKey
  from: string
  to: string
  amountMinor: string
}): Promise<string> {
  await ensureChain(input.chain)

  const preflight = await preflightUsdt({ chain: input.chain, from: input.from, amountMinor: input.amountMinor })
  if (preflight.problem === 'INSUFFICIENT_USDT') throw new PactError('INSUFFICIENT_FUNDS')
  if (preflight.problem === 'NO_GAS') throw new PactError('INSUFFICIENT_GAS', EVM_CHAINS[input.chain].nativeSymbol)

  try {
    const hash = (await getEthereum().request({
      method: 'eth_sendTransaction',
      params: [
        {
          from: input.from,
          to: EVM_CHAINS[input.chain].usdt, // the token contract, not the recipient
          data: encodeTransfer(input.to, input.amountMinor),
          value: toHexQuantity(0n), // an ERC-20 transfer moves no native coin
        },
      ],
    })) as string

    if (typeof hash !== 'string' || !hash.startsWith('0x')) {
      throw new PactError('UNKNOWN', 'Wallet did not return a transaction hash.')
    }
    return hash
  } catch (cause) {
    throw toPactError(cause)
  }
}

export interface Receipt {
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  blockNumber: number | null
}

/** Poll-once receipt read. `null` receipt means still in the mempool, not failed. */
export async function getReceipt(hash: string): Promise<Receipt> {
  const receipt = (await getEthereum().request({
    method: 'eth_getTransactionReceipt',
    params: [hash],
  })) as { status?: string; blockNumber?: string } | null

  if (!receipt) return { status: 'PENDING', blockNumber: null }
  return {
    status: receipt.status === '0x1' ? 'SUCCESS' : 'FAILED',
    blockNumber: receipt.blockNumber ? Number(BigInt(receipt.blockNumber)) : null,
  }
}

export function explorerUrl(chain: EvmChainKey, hash: string): string {
  return `${EVM_CHAINS[chain].explorer}${hash}`
}

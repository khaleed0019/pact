import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, fail, ok } from '@/lib/api/handler'
import { recordPaymentSchema } from '@/lib/api/schema'
import { counterpartOf, loadPact, viewerOf } from '@/lib/api/pact-helpers'
import { formatWithCurrency } from '@/lib/pact/money'

export const dynamic = 'force-dynamic'

/**
 * Register the *intention* to pay, before the wallet is ever opened.
 *
 * The order matters. PACT writes a PENDING row first, hands back the exact recipient and
 * memo, and only then does the client ask the wallet to send. If the user cancels, the
 * app crashes, or the phone dies mid-flow, there is still a record that a payment was
 * attempted and the milestone is not silently left looking unpaid-and-untouched.
 *
 * A payment is never created as CONFIRMED. It becomes SUBMITTED when the wallet returns
 * a reference, and CONFIRMED only via the status route.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const input = await body(request, recordPaymentSchema)

    const pact = await loadPact(input.pactId)
    const viewer = viewerOf(pact, session.address)

    if (viewer.role !== 'CLIENT') {
      return fail('NOT_ALLOWED', 403, 'Only the client sends payment on this agreement.')
    }

    const counterparty = counterpartOf(pact, viewer.role)
    if (!counterparty?.address) {
      return fail('NOT_ALLOWED', 409, 'The other party has not joined yet, so there is nowhere to send this.')
    }

    if (input.milestoneId && !pact.milestones.some((m) => m.id === input.milestoneId)) {
      return fail('VALIDATION', 422, 'That milestone is not part of this agreement.')
    }

    /*
     * USDT settles on an EVM chain, so it needs the recipient's EVM address — their
     * Nimiq address cannot receive an ERC-20 transfer. If they have not opened the
     * agreement in Nimiq Pay yet, we say exactly that instead of letting the payment
     * proceed toward an address that does not exist.
     */
    if (pact.currency === 'USDT' && !counterparty.evmAddress) {
      return fail(
        'NOT_ALLOWED',
        409,
        `${counterparty.displayName} needs to open this agreement in Nimiq Pay once before they can be paid in USDT.`,
      )
    }

    const repo = getRepository()
    const payment = await repo.recordPayment({
      pactId: pact.id,
      milestoneId: input.milestoneId,
      fromAddress: session.address,
      toAddress: counterparty.address, // resolved here, never taken from the request
      amountMinor: input.amountMinor,
      currency: pact.currency,
      chain: pact.chain,
      // NIM carries the agreement reference on-chain. USDT cannot: a plain ERC-20
      // transfer has no memo field, so for USDT the link is the stored tx hash instead.
      memo: pact.currency === 'NIM' ? `PACT:${pact.shortId}:${input.milestoneId ? input.milestoneId.slice(0, 8) : 'full'}` : null,
      idempotencyKey: input.idempotencyKey,
    })

    return ok(
      {
        payment,
        // Everything the client needs to build the wallet call, all decided server-side.
        instruction: {
          /** Nimiq address — used for NIM, and shown as the counterparty either way. */
          recipient: counterparty.address,
          /** EVM address — the actual `transfer()` recipient for USDT. */
          evmRecipient: counterparty.evmAddress,
          recipientName: counterparty.displayName,
          amountMinor: input.amountMinor,
          currency: pact.currency,
          chain: pact.chain,
          memo: payment.memo,
          label: formatWithCurrency(input.amountMinor, pact.currency),
        },
      },
      201,
    )
  })
}

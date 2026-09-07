import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { authed, body, fail, ok } from '@/lib/api/handler'
import { sealSchema } from '@/lib/api/schema'
import { isFullySealed, loadPact, viewerOf } from '@/lib/api/pact-helpers'
import { buildSealMessage, verifySignature } from '@/lib/nimiq/verify'
import { normalizeAddress } from '@/lib/nimiq/address'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * The Seal — the feature the whole product rests on.
 *
 * Sealing is not a database flag. Each party signs a message that contains the
 * fingerprint of the exact terms, using the key in their Nimiq Pay wallet. This server
 * then verifies that signature and derives the signer's address from the public key.
 *
 * What that buys, concretely: once a pact is ACTIVE, neither side can later claim they
 * agreed to something different. The signature only validates against one digest, and
 * the digest only matches one set of terms. Editing the terms clears both signatures
 * (see `MemoryRepository.reseal`), so a sealed pact always carries signatures over its
 * current contents rather than over something it used to say.
 */

/** Hand the client the exact text to sign. The client never composes it itself. */
export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const pact = await loadPact(id)
    const viewer = viewerOf(pact, session.address)

    return ok({
      message: buildSealMessage({
        shortId: pact.shortId,
        title: pact.title,
        termsDigest: pact.termsDigest,
        role: viewer.role,
      }),
      termsDigest: pact.termsDigest,
      alreadySealed: pact.participants.some(
        (p) => p.address && normalizeAddress(p.address) === viewer.address && p.sealSignature !== null,
      ),
    })
  })
}

export async function POST(request: Request, context: Context): Promise<NextResponse> {
  return authed(async ({ session }) => {
    const { id } = await context.params
    const input = await body(request, sealSchema)

    const pact = await loadPact(id)
    const viewer = viewerOf(pact, session.address)

    const result = verifySignature({
      message: buildSealMessage({
        shortId: pact.shortId,
        title: pact.title,
        termsDigest: pact.termsDigest,
        role: viewer.role,
      }),
      publicKey: input.publicKey,
      signature: input.signature,
    })

    if (!result.ok) {
      return fail('NOT_ALLOWED', 400, 'That signature does not match these terms. The agreement may have changed — reload and try again.')
    }

    /*
     * The signature is valid, but valid for *whom*? A signature proves possession of a
     * key; it does not prove the signer is the person whose session this is. Deriving the
     * address from the public key and comparing it to the session address closes that
     * gap — otherwise anyone could replay a counterparty's signature under their own login.
     */
    if (normalizeAddress(result.address) !== normalizeAddress(session.address)) {
      return fail('NOT_ALLOWED', 403, 'That signature was made by a different wallet than the one you signed in with.')
    }

    const repo = getRepository()
    let updated = await repo.recordSeal({
      pactId: id,
      address: session.address,
      signature: input.signature,
      publicKey: input.publicKey,
    })

    await repo.addActivity({
      pactId: id,
      kind: 'TERMS_ACCEPTED',
      actorAddress: session.address,
      actorName: viewer.displayName,
      summary: `${viewer.displayName} signed the terms`,
      meta: { fingerprint: pact.termsDigest },
    })

    // Once both signatures are in, the pact locks itself. Neither party has to remember
    // to press a second button for the agreement to become binding on both of them.
    if (isFullySealed(updated) && (updated.status === 'PENDING' || updated.status === 'NEGOTIATING')) {
      updated = await repo.setStatus(id, session.address, 'ACTIVE')
      await repo.addActivity({
        pactId: id,
        kind: 'PACT_SEALED',
        actorAddress: null,
        actorName: 'PACT',
        summary: 'Both sides signed. The terms are locked.',
        meta: { fingerprint: pact.termsDigest },
      })
    }

    return ok({ pact: updated, sealed: isFullySealed(updated), encoding: result.encoding })
  })
}

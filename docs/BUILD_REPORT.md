# Build report: Pact + Vyntara, Cycle III

What was done, what was decided, and what is still unproven. Written to be checked, so
each claim names where it lives.

## Stage A: Audit

**Decision: port Vyntara's model into Pact; do not merge the codebases.**

- Vyntara is Astro + Solana (SIWS) + Drizzle/PGlite, 30 tables, no Nimiq. Pact is Next.js
  + Supabase + the Nimiq Mini App SDK. Merging would have meant discarding one of them.
- Vyntara's "escrow" language was not backed by an on-chain program. None of that wording
  was carried over, and the honesty check (`npm run check:honesty`) would fail if it were.
- Carried over as concepts: campaign (brief, requirements, reward, spots), claim, review
  and payment as separate steps. Not carried over: Astro/Solana code, the admin area,
  the theme system, investor pages.

## Stage B/C: Campaigns

- A campaign is only the offer (`lib/campaigns/model.ts`, migration `0007`). Taking it up
  creates an ordinary two-party pact (`lib/campaigns/service.ts: claimCampaign`), so
  signing, delivery, review and payment are the existing machinery, not a parallel one.
- Spots are reserved under a row lock (`claim_campaign_slot`), one per person. A spot
  returns if its agreement is declined or cancelled. The function was exercised on the
  live database in a rolled-back transaction.
- Budget is shown as: most it could commit (reward x spots), agreed so far, confirmed
  paid. Nothing in the schema can express money being held.
- Pages: Earn (`/campaigns`), post work, campaign detail with owner and worker views. A
  pact from a campaign links back to it.
- The brand is notified through the existing reminders (a signature request); a test
  pins this.

## Stage D: Payment safety (the largest change)

**Found:** any client could mark a payment CONFIRMED with any non-empty string, and the
payment sheet did so the moment the wallet returned. Any status could overwrite any
other, and a problem after money left the wallet marked the payment FAILED.

**Fixed:**

- The payer can only report "sent". `CONFIRMED` is written only by the server after
  reading the Nimiq network (`lib/nimiq/verifyPayment.ts`, `lib/api/reconcile.ts`).
- NIM: transaction exists, executed, right network, right recipient, right amount, this
  agreement's memo, at least 2 confirmations. USDT: the real contract, recipient, amount,
  and a minimum confirmation depth per chain.
- Infrastructure failure never fails a payment; only a positive mismatch does.
- A payment state machine (`lib/pact/paymentState.ts`): confirmed is final, pending cannot
  jump to confirmed, and one transaction can settle only one payment (unique index, `0006`).
- The payment sheet no longer self-confirms; a sent-but-unconfirmed payment has a "Check
  payment status" action so nobody pays twice.

## Verification

- 127 tests (`npm run verify`), including recorded mainnet response shapes for the NIM
  verifier, the payment state machine, the claim flow and the race for the last spot.
- Production build clean; both deploys READY on Vercel; migrations `0006` and `0007`
  applied to the live database.
- Campaign pages checked in the browser at desktop and 375px width, no sideways scroll.

## Not proven yet

- No real payment has gone through the live app. The NIM verifier is tested against a
  recorded mainnet response shape; the USDT path against ERC-20 standard fixtures only.
- The two-wallet flow (post, take up, sign, deliver, approve, pay, confirm) has not been
  run end to end on the live app. The worker side was covered in tests, not in a browser.
- The optional AI layer was deliberately left out.
- Real usage needs real people; nothing here is, or can be, simulated.

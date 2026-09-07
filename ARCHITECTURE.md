# PACT — Architecture

> **Don't just send money. Send certainty.**
> A Nimiq Pay Mini App for making, signing, tracking and paying informal agreements.

This document was written **after** reading the Nimiq Mini Apps framework surface, not
before. Every capability claimed below maps to a method that actually exists.

---

## 1. Verified framework ground truth

Source: `@nimiq/mini-app-sdk@0.1.0` type definitions (`dist/index.d.ts`,
`dist/provider.d.ts`) plus <https://nimiq.dev/mini-apps>.

### 1.1 Nimiq provider — `window.nimiq`, obtained via `init()`

| Method | Signature | Notes |
|---|---|---|
| `listAccounts()` | to `string[] \| ErrorResponse` | The user's NQ addresses |
| `sign(message)` | to `{ publicKey, signature } \| ErrorResponse` | Ed25519 over the message |
| `isConsensusEstablished()` | to `boolean` | Gate before quoting chain state |
| `getBlockNumber()` | to `number` | Context for `validityStartHeight` |
| `sendBasicTransaction({recipient, value, fee?, validityStartHeight?})` | to `string \| ErrorResponse` | `value` in **Luna** (1 NIM = 1e5 Luna). Returns the serialized transaction |
| `sendBasicTransactionWithData({recipient, value, data, ...})` | to `string \| ErrorResponse` | Same, plus a data field |
| `sendNewStakerTransaction` … `sendRemoveStakeTransaction` | staking | Not used by PACT |

`ErrorResponse` is `{ error: { type, message } }`. **These methods resolve with an
error object rather than throwing.** Every call site must narrow before use. This is
the easiest way to get a Mini App subtly wrong, so it is centralised in
`lib/nimiq/provider.ts` and never inlined anywhere else.

### 1.2 Host context — `window.nimiqPay`

- `language` — ISO 639-1, seeded before the page script runs, so it drives i18n.
- `requestDeviceIdentifier({ reason })` — 64-char hex, **per-origin, per-device**.
  The docs are explicit: *do not use it as a user identity for authentication.*
  PACT uses it only for anti-spam rate limiting and local draft recovery.

### 1.3 EVM provider — `window.ethereum` (EIP-1193)

- Methods: `eth_requestAccounts`, `eth_accounts`, `eth_chainId`, `eth_call`,
  `eth_sendTransaction`, `eth_getTransactionReceipt`, `eth_estimateGas`,
  `personal_sign`, `eth_signTypedData_v4`, `wallet_switchEthereumChain`
  (rejects with `4902` when the chain is unknown).
- One EVM address across all chains.
- USDT and USDC are **6 decimals**, not 18.
- Gas is paid in the chain's **native** token (POL on Polygon, ETH on Arbitrum).

| Chain | chainId | USDT contract |
|---|---|---|
| Polygon | `0x89` | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |
| Ethereum | `0x1` | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| Arbitrum One | `0xa4b1` | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` |
| Optimism | `0xa` | `0x94b008aA00579c1307B0EF2c499aD98a8ce58e58` |

### 1.4 Deep links (the growth loop)

- `https://nimpay.app/miniapps/open/<host>/<path>`
- `nimiqpay://miniapp?url=<host>/<path>`

### 1.5 What the framework does **not** give us

**There is no escrow, no smart contract, no conditional release, no multisig.**
A Mini App can ask the wallet to send a payment. It cannot hold one.

PACT therefore never uses the word "escrow" in product copy, and shows an explicit
direct-payment notice on every payment screen. See section 3.

---

## 2. What PACT actually is

Because funds cannot be held, PACT competes on the layer that genuinely is missing:
**a shared, signed, verifiable record of what was agreed and what has happened since.**

Three mechanics, all real:

1. **The Seal is a signature.** When both parties accept, each calls `nimiq.sign()`
   over a canonical digest of the exact terms. The server verifies the Ed25519
   signature and derives the NQ address from the returned public key. A sealed PACT
   is therefore non-repudiable: neither side can later claim different terms, because
   both signatures commit to one canonical digest.
2. **Payments carry the agreement on-chain.** NIM payments go out through
   `sendBasicTransactionWithData` with `data = PACT:<pactId>:<milestoneId>`. The
   payment's purpose is written into the ledger itself — auditable by anyone, with no
   trust in PACT's own database.
3. **Trust is computed, never invented.** Reputation counts only rows PACT can prove:
   sealed agreements, verified signatures, recorded transaction hashes, timestamps.
   No AI personality scores.

This is why PACT belongs *inside* a wallet and could not be an ordinary web app: the
signature, the address identity and the payment all come from the wallet.

---

## 3. Honesty rules (enforced in code, not just intent)

| Rule | Enforcement |
|---|---|
| Never say escrow / held / released | `scripts/check-honesty.mjs` fails the build on those tokens in `app/` and `components/` |
| Never claim a payment succeeded from client state alone | Payment rows go `pending → submitted → confirmed`; `confirmed` is set only by a server route that has seen a transaction hash |
| AI is not legal advice | The disclaimer component is required on the review and explain surfaces |
| Trust metrics show their denominator | The trust profile renders "4 of 5 on time", never a bare 80% |

---

## 4. System architecture

```
+----------------------- Nimiq Pay (WebView, mobile) ------------------------+
|  window.nimiq   window.nimiqPay   window.ethereum                          |
+-----------------------------------+----------------------------------------+
                                    | injected providers
+-----------------------------------v----------------------------------------+
| PACT Mini App - Next.js 15 App Router (single deployment)                   |
|                                                                            |
|  app/(app)/*      Client screens: Command Center, Pact detail, Builder      |
|  components/      Design system, Seal, Timeline, payment sheets             |
|  lib/nimiq/       THE ONLY place the providers are touched                  |
|      provider.ts    init, unwrap ErrorResponse, typed errors                |
|      payments.ts    NIM (data field) + USDT (ERC-20 encode, chain switch)   |
|      identity.ts    sign-in-with-Nimiq challenge/response                   |
|  lib/pact/        Pure domain logic: state machine, hashing, money          |
|  lib/i18n/        Locale seeded from window.nimiqPay.language               |
|                                                                            |
|  app/api/*        Server routes. All privileged work happens here.          |
|      auth/*         nonce issue, Ed25519 verify, session cookie             |
|      pacts/*        CRUD, state transitions, negotiation, seal              |
|      payments/*     record intent, confirm by transaction hash              |
|      ai/*           Claude structured-output proxy (key stays server-side)  |
+-----------------------------------+----------------------------------------+
                                    |
                    +---------------v----------------+
                    | Repository interface           |
                    |  - SupabasePostgresRepo (prod) |
                    |  - MemoryRepo (demo / no env)  |
                    +--------------------------------+
```

**Why a repository interface.** The competition rules require the app to be *"fully
functional and usable on the first try."* A judge who clones the repo with no Supabase
project must still get a working app. `MemoryRepo` is seeded with the three demo
scenarios, so `npm run dev` against an empty `.env` is already a complete product.

---

## 5. Authentication — Sign-In With Nimiq

`requestDeviceIdentifier` is explicitly not an identity, so PACT does not use it as
one. Instead:

1. Client calls `POST /api/auth/nonce`; the server stores a single-use nonce (5 min TTL).
2. Client calls `nimiq.sign()` over a fixed-format message containing the nonce and origin.
3. Client calls `POST /api/auth/verify` with `{ publicKey, signature, nonce }`.
4. **The server** verifies the Ed25519 signature over the exact reconstructed message,
   then derives the address itself: `address = Blake2b-256(publicKey)[0..20]`, rendered
   in Nimiq's friendly base32 form with the IBAN-style mod-97 checksum.
5. The server issues an HttpOnly, `SameSite=Lax`, HMAC-signed session cookie.

The client never asserts who it is. The address is a *derived* fact, so a hostile
client cannot claim another user's address without holding their key.

## 6. Data model

`users, profiles, pacts, pact_participants, milestones, payments, deliverables,
negotiations, negotiation_changes, activities, notifications, trust_metrics,
invitations`

Every table carries `id uuid primary key`, an ownership foreign key, `status`,
`created_at`, `updated_at`, indexes on every foreign key, and an index on
`(status, due_date)` for the reminder scan. Row Level Security is on for all tables;
writes go only through server routes holding the service key. Full DDL lives in
`supabase/migrations/`.

## 7. Pact state machine

```
DRAFT -> PENDING <-> NEGOTIATING -> ACTIVE -> IN_PROGRESS -> DELIVERED -> COMPLETED
            |             |                                      |
            +---- DECLINED / CANCELLED <-----------------+       +-> DISPUTED
```

Transitions are a pure function in `lib/pact/state.ts` (`canTransition(from, to, actor)`)
and are re-checked **server-side** on every mutation. The client uses the same function
only to decide which buttons to render.

## 8. AI architecture

- Model: Claude, called **server-side only** from `app/api/ai/*`.
- Structured output via a strict JSON schema, then validated with Zod. A response that
  fails validation is discarded, never persisted.
- Three surfaces: `extract` (Pact Builder), `review` (Smart Review), `explain`
  (Explain This Pact).
- **Graceful degradation:** with no `ANTHROPIC_API_KEY`, `lib/ai/fallback.ts` runs a
  deterministic extractor (amount, currency, date and party parsing plus a heuristic
  ambiguity checker). The Builder still works, and the UI states that the review is
  heuristic rather than model-generated.
- AI never writes to the database directly. It returns a draft the user edits and submits.

## 9. Error handling

`lib/errors.ts` maps every failure to a `UserFacingError { title, body, retry }`:
provider missing (not running inside Nimiq Pay), init timeout, user rejected,
insufficient funds, insufficient gas, wrong chain / `4902`, consensus not established,
network offline, duplicate submit (idempotency key), expired invite, stale state (409).
Payment cancellation is a first-class outcome rather than an error: it returns the user
to the milestone with the payment still `pending`.

## 10. Mobile and performance

Mobile-first, 44px minimum touch targets, primary actions in the thumb zone, `100dvh`
plus safe-area insets, no hover-only affordances, `prefers-reduced-motion` respected on
every animation, skeletons on every async surface, route-level code splitting, and no
animation or chart dependency heavier than framer-motion.

## 11. Build order

1 framework recon (done), 2 architecture (done), 3 scaffold, 4 Nimiq layer,
5 creation, 6 lifecycle, 7 payments, 8 milestones, 9 negotiation, 10 timeline,
11 smart review, 12 trust, 13 demo mode, 14 polish, 15 test, 16 submission.

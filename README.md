# PACT

**Don't just send money. Send certainty.**

A Nimiq Pay Mini App for the agreements people actually make: *"I'll pay you when you
finish."* *"Send the work first."* *"Half upfront."* PACT turns that sentence into terms
both sides sign with their Nimiq wallet, then tracks the work and the payments against it.

Built for the [Nimiq Mini Apps Competition, Cycle II](https://miniappscompetition.com).

---

## The problem

Freelancers, clients, creators and small sellers make informal deals constantly, and then
disagree about them. Not usually because someone is dishonest — because nobody wrote down
what was agreed, and two people remember it differently.

Existing answers are all wrong-shaped. A contract template is too heavy for a 200 USDT
job. A chat thread is not a record anyone can point at. An escrow service takes custody,
takes a fee, and does not exist inside the wallet where the money already is.

## What PACT does

1. **Pick what kind of agreement it is.** Freelance work and money between people carry an
   amount; a commitment or a challenge has no money in it at all, and the app drops every
   payment field rather than showing you a zero. The category also decides what the two
   sides are called — "Paying" and "Delivering" is wrong for two friends holding each
   other to a running schedule.
2. **Describe the deal in your own words.** PACT extracts the parties, deliverable,
   amount, currency, deadline, payment condition and milestones into a structured
   agreement you can edit.
3. **Smart Review flags what could be read two ways** — "several videos", a missing
   deadline, uncapped revisions — and proposes a concrete fix for each.
4. **Both sides sign it with their Nimiq wallet.** Not a checkbox: a real Ed25519
   signature over a fingerprint of the exact terms.
5. **Pay from the agreement**, when there is money in it. NIM payments carry the agreement
   reference on-chain in the transaction's data field. USDT settles as an ERC-20 transfer
   on the chosen chain.
6. **Raise an issue if it goes wrong.** Pick from the four things that actually go wrong,
   say what happened in your own words, and the other side sees both. Either of you can
   mark it resolved.
7. **Everything lands on one shared timeline** that both parties see identically.
8. **Publish the record, if you both want to.** A published agreement gets a link anyone
   can open to check the terms, the fingerprint and both signatures — without seeing your
   delivery notes, transaction references or full wallet addresses.

---

## Why this belongs inside Nimiq Pay

This is the part that matters, so it is stated plainly: **PACT could not be an ordinary
web app.** Three of its mechanics come directly from the wallet.

### 1. The Seal is a signature

When both parties accept, each calls `nimiq.sign()` over a canonical Blake2b digest of the
terms. The server verifies the signature and **derives the signer's address from the
returned public key** — it never accepts an address a client claims.

A sealed PACT is therefore non-repudiable. Neither side can later claim different terms,
because a signature only validates against one digest and a digest only matches one set of
terms. Edit any term and both signatures are cleared, so an `ACTIVE` pact always carries
signatures over its *current* contents.

### 2. The brand mark is the fingerprint

The **PACT Seal** — the ring around every agreement — is a direct rendering of that
digest. Each of its 32 hex characters becomes one tick whose length is that character's
value. Two people can compare seals across two phones and see instantly whether they are
looking at the same agreement, and **a changed agreement visibly changes shape**. The
identity of the product and its security property are the same object.

### 3. Payments carry the agreement on-chain

NIM payments go out through `sendBasicTransactionWithData` with
`data = PACT:<shortId>:<milestone>`. The payment's purpose is written into the Nimiq
ledger itself — verifiable by anyone, with no trust in PACT's database.

---

## What PACT does not do

The Mini Apps framework gives a Mini App no way to hold, freeze or conditionally release
funds. **So PACT never claims to.**

- Payments go **directly** from one wallet to the other. PACT records them; it never
  holds them and cannot reverse one.
- There is no escrow. Paying before delivery means trusting the other side — the app says
  this on every payment screen rather than implying otherwise.
- The AI helps you word an agreement clearly. It is not legal advice, and every AI surface
  says so.
- Trust metrics count only what can be evidenced, and always show the denominator: "4 of
  5 delivered on time", never a bare 80%. `/stats` applies the same rule to the whole
  product, and every figure there is a `count(*)` over agreements that already exist —
  PACT records no page views, no sessions, and nothing about what any individual did.
- Raising an issue records a disagreement. It does not adjudicate one, and it moves no
  money: there is no "upheld" or "rejected", because neither is something this app could
  honestly decide.
- A published record proves that specific terms produced a specific fingerprint and that
  two keys signed it. It does not prove the work was any good or that money arrived, and
  the page says exactly that rather than implying otherwise.
- Every pact is private until a participant publishes it, and either of them can undo
  that. "Anyone with the link can check this" and "list this publicly" are separate
  choices — a shareable pact never appears in the public directory.

This is enforced, not just intended. `npm run check:honesty` fails the build if the words
*escrow*, *funds are held*, *release the funds*, *guarantee payment*, *refund* or *legally
binding* appear in any user-facing file without a negation. It runs in `npm run verify`.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and press **Explore demo**.

**No `.env` is required.** With no configuration at all you get a fully working app: the
store is seeded with three demo agreements, and the Pact Builder falls back to a
deterministic reader when no AI key is present. Nothing is stubbed out or mocked away —
the same code paths run either way.

Add a `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`) to `.env.local` to switch the Builder,
Smart Review and Explain onto a model, and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to
switch onto Postgres. See [`.env.example`](.env.example).

### Testing inside Nimiq Pay

Wallet signing and payments need the injected providers, so they only work inside the
Nimiq Pay WebView. Serve the app over HTTPS and open:

```
https://nimpay.app/miniapps/open/<your-host>
```

Outside Nimiq Pay the app detects the missing provider and offers the demo instead of
failing — a judge on a laptop still sees the whole product.

---

## Framework surface used

Verified against the `@nimiq/mini-app-sdk@0.1.0` type definitions rather than assumed.

| Capability | API | Where |
|---|---|---|
| Wallet address | `listAccounts()` | `lib/nimiq/provider.ts` |
| Sign-in | `sign()` + server-side Ed25519 verify | `app/api/auth/*` |
| Seal an agreement | `sign()` over the terms digest | `app/api/pacts/[id]/seal` |
| NIM payment with memo | `sendBasicTransactionWithData()` | `components/pact/PaymentSheet.tsx` |
| Chain state | `isConsensusEstablished()`, `getBlockNumber()` | `lib/nimiq/provider.ts` |
| USDT payment | `window.ethereum` → `eth_sendTransaction` | `lib/nimiq/evm.ts` |
| Chain switching | `wallet_switchEthereumChain` (handles `4902`) | `lib/nimiq/evm.ts` |
| Balance / gas preflight | `eth_call` `balanceOf`, `eth_getBalance` | `lib/nimiq/evm.ts` |
| Locale | `window.nimiqPay.language` | `lib/nimiq/provider.ts` |
| Anti-spam handle | `requestDeviceIdentifier()` | `lib/nimiq/provider.ts` |
| Invite deep link | `nimpay.app/miniapps/open/…` | `components/pact/InvitePanel.tsx` |

Two framework details that are easy to get wrong, and are handled centrally so no call
site can get them wrong individually:

- **The Nimiq provider resolves with `{ error: { type, message } }` instead of throwing.**
  A call site that forgets to narrow would treat an error object as success — which for
  `sendBasicTransaction` means telling someone their money went out when it did not.
  Every provider call goes through `unwrap()` in `lib/nimiq/provider.ts`.
- **USDT is 6 decimals, not 18**, and gas is paid in the chain's native token. Amounts are
  minor-unit strings end to end; `lib/pact/money.ts` never sees a float.

---

## Architecture

Full write-up in [ARCHITECTURE.md](ARCHITECTURE.md).

```
app/                Next.js 15 App Router
  api/              Server routes — all privileged work happens here
  p/[id]            One agreement
  new               The AI Pact Builder
  i/[token]         Invitation landing (readable before you connect a wallet)
  pacts             Every agreement you're part of
  activity          Notifications
  trust             Trust profile
  verify/[shortId]  Public record — no session, no wallet, no membership
  discover          Agreements their parties chose to list publicly
  stats             Product-wide usage, counted from rows that already exist
components/
  seal/             The PACT Seal
  pact/             Timeline, payment, sealing, delivery, negotiation, dispute sheets
  nav/              Bottom tab bar
  ui/               Design system primitives
lib/
  nimiq/            The only place the wallet providers are touched
  pact/             Pure domain logic — state machine, digest, money, categories,
                    and verification.ts, the single redaction boundary
  ai/               Model calls (Gemini or Anthropic) + deterministic fallback
  db/               Repository interface, in-process store, Postgres adapter, demo seed
supabase/migrations Complete Postgres schema
```

### Security

- **Sign-In With Nimiq.** The server issues a nonce, the wallet signs a message
  containing it and the origin, and the server verifies the signature and derives the
  address itself. The client never asserts an identity.
- Session cookie is HttpOnly, `SameSite=Lax`, `Secure` in production, HMAC-signed, with
  constant-time comparison. `SESSION_SECRET` is mandatory in production — the app refuses
  to start without it rather than falling back to a per-instance random key.
- Nonces are single-use with a 5 minute TTL, and are spent before verification so a failed
  attempt cannot be retried against the same challenge.
- Every mutation re-checks the lifecycle transition and the caller's role **server-side**,
  against stored participants. The UI hiding a button is a hint, not the control.
- Payment recipients are resolved server-side from the pact. A client cannot name its own.
- Amounts and milestone splits are recomputed on the server from percentages, never
  trusted from the request body.
- AI output is parsed with Zod and discarded if it does not fit. Nothing a model returns
  is written straight to storage.
- No secrets reach the browser. `lib/ai/providers.ts`, `lib/db/*` and `lib/auth/session.ts`
  are all `server-only`, so an accidental client import is a build error rather than a
  leaked key.
- **The public record has one redaction boundary, in one file.** Everything a
  non-participant can see goes through `toVerificationRecord()` in
  `lib/pact/verification.ts`, which builds a separate `VerificationRecord` type field by
  field rather than spreading a pact — so a column added later cannot publish itself. A
  test serialises the whole payload and greps it for wallet addresses.
- **Visibility checks are allowlists, not denylists.** `=== 'SHAREABLE' || === 'PUBLIC'`
  rather than `!== 'PRIVATE'`, so a row from before that column existed, or one written by
  a newer deploy, withholds instead of publishing. This was a real bug caught in testing,
  and it is now pinned by a test over `null`, `undefined`, `''` and unknown strings.
- A private agreement and a reference that was never issued are indistinguishable from
  outside: both return a plain 404, with no wording or timing difference to probe.

### Persistence

Two interchangeable stores behind one interface:

- **In-process** by default. Seeded with the demo scenarios so a fresh clone with an empty
  `.env` is already a working product. It does not survive a restart, and the app says so
  in a banner rather than letting you find out later.
- **Supabase Postgres** when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.

The schema is in [`supabase/migrations/`](supabase/migrations/) — `0001_init.sql` plus
migrations for the trigger `search_path`, disputes, visibility and categories:
13 tables plus a derived `trust_metrics` view, RLS enabled on every table with **no
policies at all** (Postgres denies by default, and authorisation lives in the server
routes rather than in RLS), and indexes on every foreign key.

Everything lives in a dedicated `pact` schema rather than `public`, so the migration is
safe to apply inside a Supabase project that is already running another app — nothing
collides, and `drop schema pact cascade` reverses it completely.

Two invariants are enforced by the database itself, not just by application code:

```sql
-- a payment cannot be recorded as sent or confirmed without a transaction reference
constraint settled_payments_have_a_reference check (
  status not in ('SUBMITTED', 'CONFIRMED') or tx_reference is not null
)

-- one reminder per person, per agreement, per reason. ever.
constraint one_nudge_per_reason unique (address, pact_id, kind)
```

`trust_metrics` is deliberately a **view**, not a table. Reputation has to be a function
of what actually happened; a table would be a second copy of the truth that can drift from
the rows it summarises, and a reputation number that disagrees with the history behind it
is worse than no number at all.

---

## Tests

```bash
npm run verify     # typecheck + honesty check + tests
```

83 tests, no test framework dependency — Node runs the TypeScript directly.

The ones worth knowing about:

- **Address derivation is checked against Nimiq's published burn address.** 20 zero bytes
  must render as `NQ07 0000 …`; if the base32 alphabet or the mod-97 checksum were wrong,
  it would not.
- **Signature verification** covers replay across nonces, replay across origins,
  attribution to a different public key, and malformed input.
- **The terms digest** is stable across key order and whitespace, moves when any material
  term moves, and cannot be forged by embedding a separator in a list item.
- **Milestone splits always sum back to the total**, including the cases that do not
  divide evenly.
- **The state machine** refuses to let a provider approve their own delivery, or anyone
  skip the lifecycle.
- **Attention detection** only surfaces things the viewer can actually act on.
- **The public record withholds what it should.** The whole serialised payload is checked
  for full wallet addresses, and an unrecognised visibility must withhold rather than
  publish. A shareable pact stays out of the public directory while remaining checkable
  by reference — two different consents, kept apart.
- **One open issue per agreement**, decided in storage so two simultaneous taps cannot
  both win, and only the person who raised one can withdraw it.
- **An unrecognised category renders rather than crashing** — it used to throw and take
  down the whole list screen, which is the screen that touches every pact at once.

---

## Licence

MIT — see [LICENSE](LICENSE).

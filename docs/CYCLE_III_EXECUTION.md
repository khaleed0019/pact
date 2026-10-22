# Pact × Vyntara --- Cycle III Execution Playbook

Version: 1.0\
Last reviewed: 20 October 2026\
Primary repository: https://github.com/khaleed0019/pact\
Competition deadline: 11 November 2026, 23:59 UTC\
Owner: Project lead\
Purpose: This is the persistent source of truth for implementation,
verification, competition readiness, and unfinished work. Claude Code
must re-read and update it throughout the project.

------------------------------------------------------------------------

# PART I --- INSTRUCTIONS FOR CLAUDE CODE

## 1. Your role and objective

Act as the principal engineer, security reviewer, product architect, UX
lead, test engineer, and release manager for Pact.

The goal is to turn the existing Pact + Vyntara integration into an
unusually useful, reliable, polished Nimiq Pay Mini App that has the
strongest realistic chance of scoring well in Cycle III. Do not promise
or imply that winning is guaranteed.

**Do not rebuild the project. Do not declare it finished because the
production build passes. Do not add features for feature-count alone.**

Use the current Pact repository as the host application. The reported
architecture is Next.js, Supabase/Postgres, and the Nimiq Mini App SDK.
Vyntara was Astro + Solana/SIWS + Drizzle/PGlite, so the chosen approach
is to port useful product concepts into Pact rather than merge two
separate codebases. Verify all of this against the current repository
before acting.

## 2. Mandatory persistent-work protocol

At the start of EVERY substantial work session:

1.  Read this entire file.
2.  Inspect `git status`, recent commits, and current diffs before
    editing. Never discard user changes.
3.  Inspect the current repository and the exact files related to the
    next task.
4.  Compare the implementation with the status tables and acceptance
    criteria in this file.
5.  Choose the highest-priority unfinished item that can be safely
    completed next.
6.  Implement it, run relevant tests, and record actual results.
7.  Update this file before ending the session:
    -   mark an item complete only when its acceptance criteria are met
        and evidence exists;
    -   add the test command and result;
    -   record relevant file paths, migrations, commits, deployment
        checks, and unresolved blockers;
    -   update the next action and last-worked timestamp.
8.  Continue into the next task when safe and practical; do not stop
    after merely producing a plan.

**Never mark an item complete based only on intended code, a mock, a
passing build, a unit test that does not exercise the real integration,
or an unverified claim.** Distinguish `DONE AND VERIFIED`,
`IMPLEMENTED BUT NOT VERIFIED`, `BLOCKED`, and `NOT STARTED`.

If context is running low, first update the tracker with exact state,
then finish with a short handoff. On the next session, re-read the file
and continue from the next action. Do not ask the user to repeat
information already available in this file or repository.

## 3. Current reported state --- treat as claims to verify

The project owner supplied this build report. Use it as a starting
point, not unquestionable proof:

### Architecture and campaigns

-   Decision: port Vyntara's campaign model into Pact; do not merge the
    codebases.
-   Vyntara was Astro + Solana/SIWS + Drizzle/PGlite, around 30 tables,
    and had no Nimiq integration.
-   Pact is Next.js + Supabase + Nimiq Mini App SDK.
-   Vyntara's useful concepts were campaign brief, requirements, reward,
    spots, claim, review, and payment.
-   Vyntara's Astro/Solana code, admin area, theme system, and investor
    pages were not carried over.
-   `lib/campaigns/model.ts` and migration `0007` represent campaigns.
-   `lib/campaigns/service.ts` has `claimCampaign`.
-   `claim_campaign_slot` reserves a spot under a row lock, one spot per
    person. Spots return if the agreement is declined or cancelled. This
    was reportedly exercised against the live database in a rolled-back
    transaction.
-   Campaign budget is displayed as potential commitment (reward ×
    spots), agreed amount, and confirmed paid amount. It does not
    represent money held in escrow.
-   Pages include `/campaigns`, campaign creation, and campaign detail
    with owner/worker views.
-   Campaign claims create ordinary Pact agreements; existing signing,
    delivery, review, and payment workflows are reused.
-   Existing reminders notify the brand about signature requests.

### Payment safety

-   A previous vulnerability allowed a client to mark a payment
    `CONFIRMED` with any non-empty string. This was reportedly fixed.
-   The payer can report a transaction as sent; the server verifies the
    chain before setting `CONFIRMED`.
-   NIM verification reportedly checks transaction existence, execution,
    network, recipient, amount, agreement memo, and at least two
    confirmations.
-   USDT verification reportedly checks token contract, recipient,
    amount, and a minimum confirmation depth per chain.
-   Infrastructure failures should not automatically mark payments
    `FAILED`; only positive mismatches should do so.
-   `lib/pact/paymentState.ts` enforces payment state transitions. A
    unique index in migration `0006` prevents one transaction from
    settling multiple payments.
-   Payment UI has a "Check payment status" action to avoid repeat
    payments while confirmation is pending.
-   `npm run verify` reportedly passed 127 tests, production build was
    clean, Vercel deployments were READY, and migrations `0006` and
    `0007` were applied.
-   Campaign pages were reportedly checked at desktop and 375px width
    without horizontal overflow.
-   No real live payment has yet been completed end-to-end.
-   NIM verification has been tested against recorded mainnet response
    shapes; USDT has only been tested against ERC-20 fixtures.
-   The complete two-wallet browser flow has not been tested live.
-   Optional AI was intentionally omitted.
-   Real user adoption has not yet been demonstrated.

Re-verify critical claims from code, test output, database state,
deployments, and live behavior. Do not repeat these claims as current
facts unless rechecked.

## 4. Competition requirements and positioning

Use official, current sources, not assumptions: - Rules:
https://miniappscompetition.com/rules - Cycle III:
https://miniappscompetition.com/cycle3 - Scoring:
https://miniappscompetition.com/scoring - FAQ:
https://miniappscompetition.com/faq - Official Cycle III announcement:
https://www.nimiq.com/blog/mini-apps-competition-cycle-3-announcement/ -
Nimiq Pay open-source announcement and developer links:
https://www.nimiq.com/blog/nimiq-pay-is-now-open-source/

As last checked on 20 October 2026, Cycle III ends 11 November 2026 at
23:59 UTC. Confirm the official pages again before submission.

Reported official scoring: - 45 points: functionality, reliability, and
usefulness. - 25 points: Nimiq Pay and Nimiq integration. - 15 points:
real usage. - 10 points: design and UX. - 5 points: builder promotion
checklist.

Entry requirements include a public GitHub repository under the MIT
License, a functioning Mini App inside the Nimiq Pay Mini Apps
Framework, meaningful use of at least one supported token/wallet
interaction, a submission description up to 250 words, and submission
through the official portal. Verify current wording before submission.

**Important category correction:** the official Cycle III pages describe
`Earn` primarily as putting funds to work through staking/yield. Pact's
core proposition is paid work, agreements, and payment execution; it
does not currently offer a yield product. Do not misrepresent it as a
staking/yield app and do not add risky yield features just to fit a
label. Evaluate `Pay` as the primary category because Pact creates a
meaningful payment workflow for work that needs agreed deliverables,
review, and verified payout. Confirm category fit with the current
official guidance/community before final submission. If it does not
clearly fit a category, consider the Community Council Prize/off-theme
path rather than bolting on unrelated features.

The central product promise: **"Turn a real work agreement into a
traceable, verifiable payment --- inside Nimiq Pay."**

The user experience should explain the product within seconds: - A brand
creates a paid campaign with clear terms. - A contributor accepts an
agreement, completes work, and submits evidence. - The brand reviews the
work. - The agreed payment is sent and independently verified. - Both
sides can inspect the agreement and payment history.

## 5. First-time wallet login and role selection --- required

The first-time experience must do exactly what the project owner
requested: when a user chooses to continue with their Nimiq wallet, they
must be asked whether they are a **Brand** or a **Contributor**.

Design and implement this carefully: 1. On the entry screen, present a
clear `Continue with Nimiq Pay` action and a brief explanation of why
wallet access is used. 2. Initialize/connect through the supported Nimiq
Pay Mini Apps Framework; do not invent a standalone login method or ask
users for seed phrases/private keys. 3. Once the supported wallet
identity is available, check whether that wallet already has a profile
and a chosen role. 4. For a new wallet/profile, show a clean role-choice
screen with two equally understandable options: - **I'm a Brand** --- "I
want to publish campaigns and pay contributors." - **I'm a Contributor**
--- "I want to find work, complete tasks, and get paid." 5. Explain the
practical difference before the user commits. The choice must not feel
like a confusing technical setting. 6. Persist the chosen role in the
server-backed profile associated with the verified wallet identity. Do
not trust a client-provided wallet address or role without the
appropriate validation. 7. On future visits, restore the existing role
and route to the correct dashboard without repeatedly asking. 8. Provide
a discoverable profile/settings option to switch roles or enable both
roles if the existing product model supports this safely. Do not
silently overwrite the user's role or create duplicate profiles when
they change roles. 9. Handle wallet cancellation, unavailable host APIs,
no account returned, unsupported environment, failed profile lookup, and
network errors with clear recovery actions. 10. The role selection is a
product-role choice, not a claim that the blockchain wallet itself
authenticates every server action. Enforce all permissions server-side.

Acceptance evidence: test first-time Brand, first-time Contributor,
returning Brand, returning Contributor, wallet cancellation, and
role-switch behavior in a real or explicitly identified test
environment.

## 6. Product strategy: build depth, not feature-count

The best chance comes from a complete, safe, differentiated flow and
genuine users. Use the following order.

### P0 --- Trust and release blockers

-   Prove the app loads inside the actual Nimiq Pay Mini Apps
    environment.
-   Prove the supported wallet identity/account APIs and
    token/transaction interfaces work as documented.
-   Test the complete flow with two distinct wallets: create campaign →
    claim → sign → deliver → review/approve → send payment → server
    verifies transaction → both sides see correct result.
-   Verify NIM transaction matching and confirmations against a real
    test/live transaction according to safe procedures.
-   Verify USDT only on the exact supported chain and actual token
    contract. Do not call fixtures "live verification."
-   Audit authorization, Supabase RLS, server routes, role checks,
    transaction state transitions, replay/duplicate prevention,
    budget/slot race conditions, and secret handling.
-   Fix all critical/high severity findings before adding nonessential
    features.
-   Make all payment states honest and understandable. No fake escrow,
    fake balances, simulated successful payouts, or client-authoritative
    confirmations.

### P1 --- Core experience and retention

Implement only where missing and after checking existing code: -
Brand/Contributor role choice after wallet connection. - Role-specific
first-run onboarding. - Brand dashboard: active campaigns, available
spots, commitments, completed work, verified payouts, and next
actions. - Contributor dashboard: available campaigns, accepted tasks,
deadlines, submissions awaiting review, revision requests, approved
payments, and verified earnings. - Campaign discovery: search/filter by
status, reward, deadline, category/type, and availability; useful empty
states. - Campaign detail: full brief, deliverables, acceptance
criteria, reward token/amount, deadline, number of spots, campaign
owner, and explicit explanation of payment/escrow status. - Clear
agreement preview before accepting, with the reward, deadline, scope,
review rules, and cancellation conditions visible. - Submission form
that supports relevant URLs/text/files only as safely supported by
current architecture, with timestamps and immutable or auditable
submission history. - Review workflow: approve or request revision with
a reason; do not allow self-approval. - Payment activity page with
pending/confirmed/failed states, network, token, amount, recipient,
transaction reference, and link to the appropriate block explorer where
available. - In-app notifications or existing reminder integration for
signature requests, submission events, revision requests, approvals, and
verified payment results. Avoid noisy notifications and duplicate
sends. - Helpful help/FAQ and dispute/escalation guidance that does not
promise unsupported arbitration or escrow. - Profile settings: connected
wallet, selected role, notification preferences if implemented, and a
clear disconnect/reconnect behavior appropriate to the framework. -
Mobile-first layout, accessible contrast, loading/skeleton states, retry
paths, confirmations for irreversible actions, and friendly errors.

### P2 --- Differentiators, only after P0/P1 pass

Select a small number that can be implemented and verified before the
deadline: - **Campaign quality assistant:** help a brand produce a clear
brief and objective acceptance checklist. It must not claim to verify
work automatically or authorize payouts. Avoid adding an external AI
dependency unless it is reliable and configured. - **Reusable campaign
templates:** let brands start from proven templates for creator clips,
social posts, design, research, QA, or other digital deliverables.
Templates must be editable and must not imply fake completed
campaigns. - **Campaign trust summary:** show observable signals such as
completed agreements, on-time approvals, verified payouts, and account
age only where actual records support them. No fabricated ratings or
unearned badges. - **Evidence checklist:** show each required
deliverable and whether the contributor has supplied evidence; approval
remains with the authorized brand. - **Budget guardrails:** clearly
separate total possible commitment, accepted/agreed commitment, approved
amount, payment pending, and verified paid amount. Never label a budget
"escrow" or "funded" unless funds are actually secured/verified. -
**Public campaign share pages:** allow people to discover a campaign
without exposing private wallet/profile data. Test mobile share previews
and access control. - **Repeat-work flow:** let a brand duplicate a
previous campaign while creating a new agreement and new payment
lifecycle, not reusing old payment references. - **Exportable
receipt/history:** export real agreement and verified transaction
details, clearly distinguishing app records from on-chain proof.

Do not attempt all P2 features. Choose the 2--3 that add the most value
and have clear acceptance tests.

### Explicitly defer

-   A new yield/staking product, unless the product category and scope
    are deliberately changed after checking the official criteria.
-   Multiple new chains/tokens that are not already properly supported.
-   New on-chain escrow contracts, arbitration systems, reputation
    tokens, governance, NFTs, or speculative AI agents.
-   Large analytics suites, complex admin panels, social feeds, chat
    systems, and investor pages that do not help the main journey.
-   Any feature that risks destabilizing payments or consumes the time
    needed for real-world validation.

## 7. Security, payment truth, and user protection

Preserve and strengthen the current safeguards: - The client can report
"sent"; only the server-side verifier can mark a payment `CONFIRMED`. -
Never let a client choose an arbitrary successful payment status or
transaction hash to bypass verification. - Validate chain/network,
transaction execution, token/contract, recipient, amount, memo/reference
rules, and required confirmation depth. - Confirm the semantics of each
chain and token from official documentation; do not apply NIM
assumptions to EVM tokens. - A timeout, provider outage, or RPC failure
is inconclusive, not proof of failure. Keep a retryable pending state. -
A positive mismatch may fail a payment, but preserve evidence and avoid
destructive overwrites. - `CONFIRMED` is final unless a carefully
designed chain-reorganization policy explicitly handles exceptional
cases. - One transaction cannot settle multiple payments. Enforce
idempotency on both server and database sides. - Prevent overpayment,
duplicate submissions, repeated claims, last-slot races, cross-user data
access, and unauthorized state changes. - Do not store seed
phrases/private keys. Never request them from users. - Never call the
app "escrow" unless the funds are genuinely secured by an implemented
and audited mechanism. - Clearly disclose that campaign
budget/commitment is not money held, if that remains the architecture. -
Do not label amounts as USD equivalents unless a reliable rate source
and timestamp are provided. - Keep production secrets out of logs,
client bundles, commits, screenshots, and demo recordings.

## 8. UI and visual quality bar

The app should feel like a premium, clear fintech/work marketplace, not
a generic dashboard template.

-   A user should understand the product and choose Brand or Contributor
    within seconds.
-   Use a consistent type scale, spacing, button system, status system,
    icon style, and responsive layout.
-   Prioritize the key action on each screen.
-   Avoid crowded dashboards; show summaries first and details when
    requested.
-   Use precise language for `Potential commitment`, `Agreed`,
    `Approved`, `Payment pending`, and `Verified paid`.
-   Use skeleton/loading states and recoverable errors rather than blank
    screens.
-   Make pending vs verified payment status visually distinct without
    relying on color alone.
-   Use confirmation steps for consequential actions.
-   Test at 375px width and common desktop widths; ensure no horizontal
    overflow.
-   Check keyboard focus, semantic labels, accessible contrast, touch
    target size, and readable transaction details.
-   Motion should be subtle, quick, and useful. Do not prioritize
    animation over reliability.
-   Do not fabricate testimonials, user counts, campaign activity,
    ratings, transaction histories, or social proof.

## 9. Testing protocol

Run the existing `npm run verify` and production build at appropriate
checkpoints. Discover the actual package manager and scripts before
assuming commands.

Add/maintain: - Unit tests for state transitions and pure business
rules. - Integration tests for campaign claim/slot reservation and
agreement linkage. - Authorization/RLS tests for Brand and Contributor
roles. - Tests for wallet/provider error states. - Payment verifier
tests for correct and incorrect recipient, amount, chain, token
contract, memo, confirmations, reverted transactions, provider failure,
and duplicate transaction references. - Race/concurrency tests for
claiming the last campaign slot and repeated payment requests. - Browser
tests for role selection, onboarding, campaign creation, claim,
agreement signing, submission, review, and payment status. - Responsive
and accessibility smoke tests. - Regression tests for existing Pact
agreement flows.

Maintain a truthful test matrix. Every test should say whether it is
unit, fixture-based, testnet, or real production evidence. Never
describe a mocked/recorded response as a live end-to-end payment.

### Required real-world verification

Before release, run a controlled end-to-end test with two distinct
wallets and a small, explicitly approved amount, using the safest
supported network/procedure: 1. Wallet A enters as Brand. 2. Wallet B
enters as Contributor. 3. A creates a campaign with clear reward and
acceptance terms. 4. B claims the spot and accepts/signs the agreement.
5. B submits the actual required evidence. 6. A approves or requests a
revision; test at least one revision path. 7. A sends the agreed payment
through the supported Nimiq Pay flow. 8. The server independently
verifies the real transaction. 9. Both accounts show correct final
status and transaction reference. 10. Check database records and logs
for consistency and sensitive-data leakage.

If live-mainnet testing is unsafe or expensive, use an officially
supported test environment where available and document exactly what
remains unproven for mainnet. Never claim a real payout occurred if it
did not.

## 10. User validation and competition promotion

Real usage is a scored category, not an optional afterthought.

Recruit actual, consenting testers: - At least 2--3 brands/employers and
5--10 contributors if feasible. - Have them complete meaningful real
tasks, not merely connect a wallet. - Record consented feedback, task
completion, points of confusion, failed steps, repeat intent, and
verified transactions. - Do not buy fake engagement, fabricate users, or
invent usage statistics. - Fix issues surfaced by testing before adding
low-value features.

Promotion checklist: - Share authentic build progress on X and in the
Nimiq community. - Show short clips of real workflows, with wallet
addresses and sensitive information protected. - Ask for concrete
feedback from prospective users. - Participate in relevant official
community sessions and channels when possible. - Keep a log of public
posts/feedback in this file. - Prepare a clear, truthful submission
description of 250 words or fewer. - Record a concise demo showing the
actual role choice, campaign, agreement, submission, and verified
payment flow. - Confirm public repository access, MIT license, setup
instructions, environment-variable documentation, and deployment URL. -
Submit through the official portal and re-check the deadline and
required fields.

## 11. Working rules

-   Inspect before editing.
-   Make small, coherent changes.
-   Keep the project buildable at checkpoints.
-   Never run destructive migrations or alter production data without a
    clear, approved plan.
-   Never use production funds without explicit user authorization.
-   Do not fabricate environment variables, SDK methods, API responses,
    transaction hashes, user data, or test results.
-   If blocked, complete other safe work and document the exact external
    dependency.
-   When a change touches payments, permissions, database policies, or
    migrations, explain the risk and test it.
-   Keep dependencies minimal and justify new ones.
-   Keep UI polish subordinate to a working, trustworthy main workflow.
-   Use official Nimiq documentation and the current repository as the
    technical source of truth.
-   Do not claim competition eligibility or a score as guaranteed.

------------------------------------------------------------------------

# PART II --- PERSISTENT PROJECT TRACKER

Claude Code must keep this section current. Replace `NOT VERIFIED` with
evidence, not optimism. Add dated notes instead of erasing important
history.

## 12. Current status dashboard

Last updated: **2026-10-22** (session: public/private campaigns, handles, invitations, light theme, landing)

Environment key: **U** unit test (node --test, in-process store) · **H** local HTTP run
(`scripts/e2e-two-wallets.mjs`, real routes, generated Ed25519 keys, in-process store, no
Nimiq Pay host, no funds) · **DB** live Supabase query · **B** in-app browser at 375px and
1280px, plain browser (not Nimiq Pay) · **NP** inside Nimiq Pay · **TX** real transaction.

| Area | Status | Evidence |
|---|---|---|
| Existing architecture re-audited | DONE AND VERIFIED | Baseline commit c86df8a; read lib/db/*, lib/campaigns/*, lib/nimiq/*, app/api/*, lib/auth/session.ts; SDK d.ts confirms `listAccounts`, `sign`, `sendBasicTransaction(WithData)`, `isConsensusEstablished`, `getBlockNumber`, staking calls; no balance API |
| First-time Nimiq wallet connection | IMPLEMENTED BUT NOT VERIFIED in NP | Sign-in = server nonce, wallet `sign()`, server Ed25519 verify, address derived server-side. Verified with generated keys (H). Not run inside Nimiq Pay this session |
| Brand/Contributor choice after wallet connection | DONE AND VERIFIED (B, H); NP not verified | `components/screens/RoleSelect.tsx`, `app/page.tsx`; shown when `/api/me` role is null (B: demo session; H: new key) |
| Returning-user role restoration | DONE AND VERIFIED (B, H) | Reload restores role and dashboard; H check "the role is restored on the next visit" |
| Safe role switching | DONE AND VERIFIED (U, B) | Wallet capsule menu and profile; one profile row per address (upsert on PK); U "switching keeps one profile"; agreements unaffected (roles on pacts) |
| Role-based authorization | DONE AND VERIFIED (U, H) | `assertRole` in `postCampaign`/`claimCampaign` (lib/campaigns/service.ts); H: contributor post 403, brand claim 403, unauthenticated role change 401, invalid role 422 |
| Campaign create and discovery | DONE AND VERIFIED (U, H, B) | Filters and search exercised in B with real data |
| Slot reservation / race handling | DONE AND VERIFIED (U, DB) | U race test; DB rolled-back test of `claim_campaign_slot` (2026-10-18) |
| Campaign to Pact agreement linkage | DONE AND VERIFIED (U, H, B) | UI claim lands on pact with "From the campaign" link and progress stepper |
| Submission and revision flow | DONE AND VERIFIED (H); not in NP | H: submit, changes requested with reason, resubmit, approve |
| Brand approval permissions | DONE AND VERIFIED (H) | H: contributor approving own work 403 |
| NIM verifier | U fixtures + H live-RPC negative; LIVE POSITIVE UNPROVEN | H: invented hash checked against live rpc.nimiqwatch.com stays SUBMITTED. No real PACT payment confirmed yet |
| USDT verifier | FIXTURES ONLY | No real USDT payment |
| Pending payment recovery | DONE AND VERIFIED (H, B) | Re-check by either party; receipt "Check payment status"; stranger 403 |
| Duplicate payment protection | DONE AND VERIFIED (U, DB) | Idempotency key + partial unique index `payments_confirmed_tx_unique` (0006) |
| Supabase RLS / access control audit | DONE AND VERIFIED (DB) | All 16 `pact` relations: RLS on, 0 policies; `anon`/`authenticated`: no schema usage, no select, no execute on `claim_campaign_slot` |
| Nimiq Pay host compatibility | NOT VERIFIED | Needs a run inside Nimiq Pay (owner) |
| Mobile UI / accessibility | DONE AND VERIFIED (B) for checked screens | 375px dark + light (2026-10-22): landing, home, invitations, campaign detail/preview, pact progress, payment sheet; no horizontal overflow; focus ring; reduced motion/transparency fallbacks. Light theme shipped (follows device, Auto/Light/Dark switch) |
| Production deployment | DONE AND VERIFIED (2026-10-20) | https://pact-nimiq.vercel.app serves commit 8cbe2bb (Vercel READY); smoke: / 200, /campaigns 200, /api/me 200 signedIn:false ephemeralStore:false, /api/dashboard 401 unauthenticated. E2E script NOT run against production (would write test data) |
| Real two-wallet end-to-end journey | NOT DONE (H substitute only) | H is 52/52 (2026-10-22, now incl. invitations) but is not a Nimiq Pay run and has no real transaction |
| Real usage / tester feedback | NOT DONE | none |
| Competition category confirmed | DECIDED: **Pay** (2026-10-20) | miniappscompetition.com/cycle3: Earn = "staking or yield"; Pay = "bill splitting, merchant checkout, tipping, invoices, subscriptions". Pact pays for agreed work |
| MIT license + public repo | DONE AND VERIFIED | github.com/khaleed0019/pact public; MIT in package.json + LICENSE |
| Submission description and demo | DESCRIPTION DRAFTED (docs/SUBMISSION.md, 248 words, Pay); DEMO NOT RECORDED | Demo must be recorded from a real Nimiq Pay run |
| Official submission | NOT DONE | Owner action |

Status definitions: - `DONE AND VERIFIED`: acceptance criteria passed
with named evidence. - `IMPLEMENTED BUT NOT VERIFIED`: code exists but
the required environment/real flow has not been exercised. - `BLOCKED`:
external dependency prevents progress; name it. - `NOT STARTED`: no
implementation/evidence yet. - `FAILED`: a test or acceptance criterion
failed; record the failure and next fix.

## 13. Release gates

### Gate A --- Trustworthy core

-   [x] Existing changes and production migrations audited. (0006, 0007, 0008 applied; DB audit 2026-10-20)
-   [ ] No unresolved critical/high severity security issue.
-   [x] Campaign budget language is accurate; no unsupported escrow
    claims. (`npm run check:honesty` passes)
-   [x] Brand/Contributor permissions enforced on the server. (U + H)
-   [x] Payment state transitions and transaction uniqueness tested. (U)
-   [x] Wallet/provider outages do not create false payment failures. (U: outage stays PENDING)

### Gate B --- Complete user journey

-   [ ] New user connects through the supported Nimiq Pay context.
-   [x] New user chooses Brand or Contributor after wallet identity is
    available. (B, H; not yet inside Nimiq Pay)
-   [x] Returning user gets the correct dashboard. (B, H)
-   [x] Brand creates a campaign. (B, H)
-   [x] Contributor claims a spot. (B, H)
-   [x] Pact agreement is signed/accepted. (H, generated keys, not Nimiq Pay wallets)
-   [x] Contributor submits evidence. (H)
-   [x] Brand approves or requests revisions. (H: both paths)
-   [ ] Payment is sent using the supported integration.
-   [ ] Server verifies transaction details and confirmation.
-   [ ] Both users see correct final status.
-   [x] No duplicate payout or unauthorized status change is possible. (U + H negatives)

### Gate C --- Product quality

-   [ ] Main actions work; no dead buttons or fake success states.
-   [x] Mobile and desktop flows are responsive. (B, 375px + 1280px)
-   [ ] Loading, empty, pending, failure, and retry states are clear.
-   [ ] User understands the product and role choice quickly.
-   [ ] Core screens have been checked for accessibility and keyboard
    use.
-   [ ] Only a small number of high-value differentiators were added
    after the core passed.

### Gate D --- Real usage and submission

-   [ ] Two-wallet end-to-end test documented.
-   [ ] Real user tests conducted and feedback recorded.
-   [ ] Findings fixed or explicitly triaged.
-   [ ] Public progress and community promotion log updated.
-   [x] Public repository and MIT License verified.
-   [ ] Submission text is 250 words or fewer and factually accurate.
-   [ ] Demo recorded from the real working app.
-   [x] Official category and rules rechecked. (2026-10-20: Pay)
-   [ ] Submission portal confirmation recorded before deadline.

Do not mark a gate complete until every required checkbox is backed by
evidence.

## 14. Dated work log

Append a new entry for each substantial work session. Do not rewrite
older entries to make progress look better.

### 2026-10-20 --- Initial playbook created

-   Starting point: owner-provided report claims 127 tests pass,
    production build clean, Vercel deployments READY, migrations `0006`
    and `0007` applied.
-   Unproven: real payment end-to-end, complete two-wallet browser flow,
    live USDT verification, real users.
-   Key product decision: first-time wallet users must choose Brand or
    Contributor after supported wallet identity is available.
-   Key strategy decision: re-check category alignment. Official Cycle
    III descriptions define Earn mainly around staking/yield; Pact's
    current paid-work workflow may fit Pay better. Do not add unrelated
    yield features solely to fit Earn.
-   First action: inspect repository, current git state, official Nimiq
    Pay Mini Apps documentation, current role/profile schema, and
    payment/provider integration. Then implement the role-selection
    experience and prioritize a full two-wallet end-to-end test.

### Add future entries below

#### 2026-10-22 --- Public/private campaigns, handles, invitations, light theme, landing

-   Owner decisions (asked first, per request): keep the desktop top bar; mobile-first,
    borrow pieces from the mockup only; theme follows the phone with an override; add
    campaign categories. Left out on purpose: Messages (no messaging feature exists) and
    campaign thumbnails (no image storage; placeholders would be fake content).
-   Migration `0009_campaign_visibility_handles_invitations.sql` (applied to live project
    `pact`, additive): campaigns get `visibility` (default PUBLIC), `category` (default
    OTHER), `submission_instructions`, `platform`, `revision_limit` (null); index swapped to
    open+public; profiles get `handle` (unique, `^[a-z][a-z0-9_]{2,19}$`), `categories`,
    `links`; new `campaign_invitations` (unique per campaign+address, RLS on, no policies).
    Backfill: none needed — every existing campaign behaves exactly as before (public).
-   Reused: pact creation/signing/review/payment engine unchanged; claim RPC unchanged;
    invitations end in the existing `claimCampaign`, so slot locking, role gate and pact
    creation are the same code path. Payment verifier untouched.
-   New/changed files: `lib/pact/handles.ts`, `lib/campaigns/{model,store,memory,supabase,service,dashboard}.ts`,
    `lib/db/{repo,memory,supabase}.ts` (profile details), `lib/api/schema.ts`,
    `app/api/campaigns/route.ts`, `app/api/campaigns/[id]/route.ts` (visibility guard),
    `app/api/campaigns/[id]/invitations/route.ts`, `app/api/invitations/[id]/{accept,decline,revoke}/route.ts`,
    `app/api/profiles/route.ts`, `app/api/profiles/[handle]/route.ts`, `app/api/me/{route,profile/route}.ts`,
    `components/campaigns/{InvitePicker,CampaignCard}.tsx`, `components/profile/HandleEditor.tsx`,
    `components/ui/ThemeSwitch.tsx`, `lib/client/theme.ts`, `lib/themeScript.ts`, `lib/cn.ts`,
    `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `app/campaigns/{page,new/page,[id]/page}.tsx`,
    `app/trust/page.tsx`, `components/screens/{Welcome,RoleSelect,RoleDashboard}.tsx`,
    `components/nav/{TabBar,WalletCapsule}.tsx`, `components/ui/Button.tsx`, `lib/pact/progress.ts`,
    `tests/invitations.test.ts`, `scripts/e2e-two-wallets.mjs`.
-   Bugs found and fixed: (1) submission instructions of 300 chars + "How to submit: "
    would exceed the pact's 300-char term limit and fail agreement creation — input capped
    at 280 (test). (2) `tailwind-merge` did not know the custom font sizes, so `text-body`
    erased the primary button's text colour everywhere (pre-existing) — fixed in `lib/cn.ts`.
-   Tests run and exact results:
    -   `npm run verify`: typecheck clean, honesty check passed, **147/147** (U).
    -   `npx next build`: compiled successfully.
    -   `node scripts/e2e-two-wallets.mjs http://localhost:3100`: **52/52** (H) — adds handle
        set/reserved/taken, handle search, private campaign 422 without invitees, unknown
        handle refused before creation, private campaign absent from marketplace, 404 to an
        uninvited user and to a guest, uninvited claim 404, invitee sees it, stranger cannot
        accept/decline (404), accept 201, double accept 409, agreement unsigned with the
        brief's working terms, invalid wallet address refused.
    -   In-app browser (B), 375px: contributor home with "Invitations for you" (dark + light),
        invitation review + accept via UI → agreement page, pact progress (light), payment
        sheet (light), landing (dark + light), post-work form with handle search (dark).
-   Environment: U, H, DB (migration), B. **Not** NP. **No** TX.
-   Unproven: everything inside Nimiq Pay; a real NIM/USDT payment reaching CONFIRMED;
    real users. Invitations by wallet address only work for checksum-valid addresses (the
    demo account's sample address is not one, by design).
-   Next action (owner, inside Nimiq Pay): Brand sets up, contributor sets a handle, brand
    posts an invite-only campaign to that handle, contributor accepts, both sign, contributor
    submits a link, brand requests one revision, contributor resubmits, brand approves and
    pays a small NIM amount, press "Check payment status" until Verified. Record it here.

#### 2026-10-20 --- Role selection, premium UI, two-identity run

-   Commit / branch: main (follows c86df8a)
-   Files changed:
    -   New: `lib/pact/roles.ts`, `lib/pact/progress.ts`, `lib/campaigns/dashboard.ts`,
        `app/api/me/role/route.ts`, `app/api/dashboard/route.ts`,
        `components/screens/RoleSelect.tsx`, `components/screens/RoleDashboard.tsx`,
        `components/nav/WalletCapsule.tsx`, `components/pact/AgreementProgress.tsx`,
        `components/pact/PaymentReceipt.tsx`, `scripts/e2e-two-wallets.mjs`,
        `supabase/migrations/0008_profile_role.sql`, `tests/progress.test.ts`,
        `docs/CYCLE_III_EXECUTION.md`
    -   Changed: `lib/db/{repo,memory,supabase}.ts` (getRole/setRole),
        `lib/campaigns/service.ts` (assertRole, postCampaign, brand-signature flag),
        `app/api/me/route.ts`, `app/api/campaigns/route.ts`, `app/page.tsx`,
        `app/trust/page.tsx`, `app/campaigns/{page,new/page,[id]/page}.tsx`,
        `app/p/[id]/page.tsx`, `components/nav/TabBar.tsx`,
        `components/campaigns/CampaignCard.tsx`,
        `components/screens/{Welcome,CommandCenter,AppChrome}.tsx`,
        `lib/client/session.tsx`, `app/globals.css` (glass material),
        `tests/campaigns.test.ts`, `README.md`, `package.json` (`e2e:local`)
-   Work completed: first-run Brand/Contributor choice saved per verified address;
    server-side role gate on posting and claiming; role dashboards computed from records;
    glass wallet capsule with menu (profile, switch role, sign out); floating glass tab bar
    on phones, conventional top bar on wide screens; campaign cards with reward, deadline,
    spots bar and skeletons; agreement preview before claiming, built by the server's own
    `termsFromCampaign`; agreement progress stepper from stored rows; payment receipts
    with distinct states (icon + words); seeded `demo:` payments no longer render as
    network-verified.
-   Tests run and exact results:
    -   `npm run verify`: typecheck clean, honesty check passed, **135/135** tests pass (U).
    -   `npx next build`: compiled successfully.
    -   `node scripts/e2e-two-wallets.mjs http://localhost:3100`: **32/32** checks pass (H).
    -   Live DB privilege/RLS query (DB); migration 0008 applied to project `pact`.
    -   In-app browser at 375px and 1280px (B): role select, home (both roles), menu,
        role switch, campaigns + filters + search, detail + preview, UI claim, pact
        progress, receipts; no horizontal overflow; focus ring visible.
-   Environment: U, H, DB, B. **Not** NP. **No** TX.
-   What remains unproven: everything inside Nimiq Pay; a real NIM payment reaching
    CONFIRMED; any USDT payment; real users. NIM explorer deep link not offered
    (nimiq.watch fragment link did not open a transaction view when checked).
-   Blockers: two real wallets inside Nimiq Pay and a small owner-approved NIM amount;
    real testers; the owner's portal submission.
-   Next action: owner runs the two-wallet flow inside Nimiq Pay (Brand posts, Contributor
    claims, both sign, submit, request a revision, approve, pay a small NIM amount, press
    "Check payment status" until Verified) and records the result here.

UI acceptance (section 21) as of this entry: audited first [x]; real data and handlers
[x]; no decorative controls [x]; no fake balances/ratings/payments [x] (demo payments
labelled); seal and stepper from real state [x]; payment state from server [x];
light/dark: dark only, light not shipped [ ]; 375px + desktop without overflow [x]; focus
ring + reduced motion/transparency [x]; SDK init untouched [x]; build [x]. Not done:
Smart Review presentation pass; light theme; check inside Nimiq Pay.

Template:

#### YYYY-MM-DD --- \[session objective\]

-   Commit / branch:
-   Files changed:
-   Work completed:
-   Tests run and exact results:
-   Environment: unit / fixture / testnet / mainnet / Nimiq Pay live:
-   What remains unproven:
-   Blockers:
-   Next action:

## 15. Feature backlog --- prioritize and update

For every feature added, include user value, acceptance criteria,
security impact, and evidence. Do not add features without a reason.

  ---------------------------------------------------------------------------------------------
  Priority          Feature               Acceptance criteria                 Status
  ----------------- --------------------- ----------------------------------- -----------------
  P0                First-time            Role is selected after wallet       NOT STARTED /
                    Brand/Contributor     identity; saved and restored        RE-VERIFY
                    choice                correctly                           

  P0                Role-based            Unauthorized API/database           NOT VERIFIED
                    authorization         operations rejected server-side     

  P0                Two-wallet end-to-end Real supported flow from campaign   NOT DONE
                    payment flow          to verified transaction             

  P0                Nimiq Pay environment Actual host/provider APIs verified  NOT VERIFIED
                    validation            in Nimiq Pay                        

  P0                RLS and payment       Negative authorization tests pass   NOT VERIFIED
                    security audit                                            

  P1                Brand dashboard       Useful                              AUDIT FIRST
                                          campaign/commitment/review/payout   
                                          summary                             

  P1                Contributor dashboard Useful                              AUDIT FIRST
                                          work/submission/deadline/payment    
                                          summary                             

  P1                Campaign              Filters work and reflect current    AUDIT FIRST
                    search/filter         data                                

  P1                Agreement preview     Terms, reward, deadline and review  AUDIT FIRST
                                          conditions visible before claim     

  P1                Submission/revision   Real browser-tested review loop     NOT VERIFIED
                    workflow                                                  

  P1                Payment history and   Display only verified, correctly    AUDIT FIRST
                    explorer links        matched transactions                

  P1                Notification          Relevant events delivered once with AUDIT FIRST
                    lifecycle             clear links                         

  P2                Campaign templates    Editable reusable templates for     DEFER UNTIL CORE
                                          real task types                     

  P2                Evidence checklist    Requirements mapped to submitted    DEFER UNTIL CORE
                                          evidence                            

  P2                Campaign quality      Produces better briefs without      OPTIONAL
                    assistant             claiming automatic approval         

  P2                Trust summary         Derived only from verifiable app    OPTIONAL
                                          records                             

  P2                Exportable receipts   Accurate agreement and verified     OPTIONAL
                                          transaction information             
  ---------------------------------------------------------------------------------------------

## 16. Final handoff format

At the end of a work session, provide the owner with: 1. What changed,
with file paths. 2. What now works and how it was verified. 3. Exact
test/build commands and pass/fail results. 4. What remains unproven. 5.
Any manual action or external credential needed from the owner. 6. The
next three highest-priority actions. 7. Confirmation that this file has
been updated.

Never say "finished," "production-ready," or "payment verified" without
the corresponding evidence.

## 17. First instruction on resuming work

Read this file and inspect the actual repository state first. Do not
assume the prior report remains current. Then: 1. Re-verify official
Cycle III rules and the Nimiq Mini Apps Framework documentation. 2.
Audit the existing wallet/profile schema and implement the first-time
Brand/Contributor selection after Nimiq wallet identity is obtained. 3.
Test role persistence, returning-user routing, and server-side
permissions. 4. Prioritize the real two-wallet end-to-end
campaign-to-payment journey. 5. Update this tracker with exact evidence
and continue until the release gates are satisfied or the deadline
requires an explicitly documented scope cut.


---

# PART III — PREMIUM UI / LIQUID GLASS DESIGN DIRECTIVE

## 18. Visual direction

The product should feel like a refined, trustworthy fintech/work marketplace: Apple-inspired Liquid Glass for selected navigation and controls, clean high-contrast content surfaces for financial information, and deliberate motion that helps users understand state changes. This is **Liquid Glass-inspired web design**, not a claim that the browser has Apple's native iOS material API.

Pact's repository currently reports Next.js 15, React 19, Tailwind CSS 3.4, `framer-motion` 12, and `lucide-react`. Verify the live `package.json` before making decisions. Prefer the existing stack and avoid adding a design system or animation dependency unless there is a clear need.

### Visual rules

- Keep content readable first. Agreement terms, reward amounts, token/network details, deadlines, payment states and transaction references need opaque or nearly opaque content surfaces with sufficient contrast.
- Use translucent glass selectively for: the top wallet/status capsule, floating mobile navigation, role-choice panels, transient menus, popovers, tooltips, and focused confirmation dialogs.
- Do NOT make every card transparent or apply heavy backdrop blur to every page. Do not place critical long text over busy backgrounds.
- Prefer a restrained, sophisticated palette based on the existing brand assets and actual Nimiq brand requirements. Build a consistent light and dark theme. Do not replace brand identity without inspecting assets.
- Use soft ambient gradients or a subtle radial glow behind the welcome/role-selection screen, not animated visual noise across every dashboard.
- Use 1px low-contrast borders, controlled highlights, subtle inner edge light, soft shadows, carefully tuned blur, and large but consistent corner radii. Avoid overdone neon outlines, excessive glow, rainbow gradients, constant movement, and decorative 3D effects on payment screens.
- Typography should be clean and highly legible. Use tabular numerals for token amounts, balances, budgets, dates, and transaction values where appropriate. Make token units and payment states unambiguous.
- Use consistent spacing, component sizes, icon sizes, focus rings, form errors, status badges, and motion timing through shared tokens/components rather than styling each page independently.
- Respect reduced-motion preferences and provide an option or fallback for reduced transparency where feasible. Test across desktop and mobile, light/dark modes, and the Nimiq Pay host environment.

## 19. UI reference libraries — use selectively, not as a dependency shopping spree

Review these official references and choose components only after inspecting the existing app. Copy/adapt a small set of components into the repository so the product has one consistent visual language.

- Apple Human Interface Guidelines — Materials: https://developer.apple.com/design/human-interface-guidelines/materials
- Apple Liquid Glass overview: https://developer.apple.com/documentation/technologyoverviews/liquid-glass
- shadcn/ui — composable accessible component primitives: https://ui.shadcn.com/
- Magic UI — selected animated React/Tailwind effects and number/text treatments: https://magicui.design/docs/components
- 21st.dev — browse premium React/Next.js references and copy selected components: https://21st.dev/
- Aceternity UI — restrained use of card effects, moving borders, and background accents: https://ui.aceternity.com/components
- React Bits — optional micro-interactions and backgrounds: https://www.reactbits.dev/
- Tailwind CSS backdrop blur utilities: https://tailwindcss.com/docs/backdrop-filter-blur
- Motion reduced-motion guidance: https://motion.dev/docs/react-accessibility

Selection guidance:
- Use existing `framer-motion` for subtle page transitions, button press feedback, tab movement, accordions, and state changes before adding another animation library.
- Use shadcn/ui primitives only if they fit the current Tailwind setup and are integrated without a wholesale rewrite. Accessible keyboard behavior and semantics must be verified.
- Magic UI, Aceternity, 21st.dev, and React Bits are inspiration/component sources; do not install all of them or import a random visual style from each. Audit bundle size, dependencies, licensing, interaction behavior, mobile behavior, and code quality for each selected component.
- Avoid heavy shaders, pointer-following effects, complex 3D, infinite marquees, and large animated backdrops in the core wallet/payment journey. They are not worth hurting performance, accessibility, or trust.

## 20. Pact-specific premium components to build or refine

Inspect whether each exists before implementation. Reuse the current component if it works.

### A. Wallet header capsule
A compact capsule showing the connected Nimiq context and abbreviated wallet identifier where allowed, with a simple connection state and a menu for profile/role/settings. Only show token balances if the supported SDK provides trustworthy values and the product already has a safe way to retrieve them. Never invent a balance or make a UI-only connection look real.

### B. First-time Brand / Contributor choice
A premium onboarding screen with a subtle ambient background and two clear choice panels:
- Brand: publish campaigns, define tasks, review deliverables, pay contributors.
- Contributor: discover campaigns, accept agreements, submit work, receive payment.
Use a restrained glass treatment for the role selector, clear selected states, accessible labels, and one primary continue action. Explain that users connect with the supported Nimiq Pay wallet. The role choice must remain accessible and must persist only through the backend-authorized profile flow.

### C. Floating mobile navigation
A compact, floating Liquid Glass-inspired mobile navigation surface, if compatible with the Nimiq Pay host and viewport. Use only the 3–5 most important routes, e.g. Campaigns, My Work/Agreements, Activity, Profile. Keep content from scrolling under it in a way that obscures actions. On desktop, use a clean, stable navigation/sidebar rather than forcing an iPhone imitation onto wide screens.

### D. Campaign discovery cards
Create a clean marketplace hierarchy: campaign title, brand/owner identity, concise brief, reward + token, deadline, open spots, work type, and status. Make reward and deadline scannable; keep the card surface mostly solid and readable. Use subtle hover/tap affordances and responsive grid/list layouts. Search and filters must use real data, not decorative controls.

### E. Pact Seal / signed-agreement identity
Pact already describes a signature fingerprint/Seal derived from the agreement digest. Make this a signature product motif: show a small clear visual signature near the agreement status and a larger explainer on the signed agreement detail. If animating it, animate the transition only; the rendered ticks/shape must derive from the true digest and must not be random decoration. Clearly differentiate draft, awaiting signature, fully signed, changed terms, and disputed states. Never imply that a visual animation itself proves a signature.

### F. Agreement and work timeline
Build a calm, readable stepper or vertical activity timeline connecting offer → claim → signatures → work submitted → review/revision → payment sent → transaction verified. Each item must reflect actual stored events/statuses. Avoid presenting future stages as completed. Support timestamps, actor attribution, and useful explanations for blocked/pending states.

### G. Payment status and receipt card
Make `Payment pending`, `Sent`, `Verified`, `Needs attention`, and any true failure states visually distinct. Present amount, token, network, payer/recipient (privacy-aware), confirmation count if authoritative, transaction reference, and real explorer link if supported. A progress indicator must be sourced from real status and must never imply the payment is complete before the server verifies it. Include copy actions for references and clear next steps for a retryable unknown state.

### H. Dashboard summaries
Use a small set of meaningful metric cards rather than a wall of numbers.
- Brand: live campaigns, available spots, agreed commitments, review queue, payment pending, verified paid.
- Contributor: open opportunities, active work, deadlines, revisions requested, approved rewards, verified earnings.
Every figure must be derived from actual data. Label `potential commitment`, `agreed`, `approved`, `payment pending`, and `verified paid` precisely. Do not imply money is held in escrow.

### I. Smart Review presentation
The repository README describes Smart Review that flags ambiguous terms and missing criteria. Present each issue as a clear review row with severity, explanation, and an editable suggested fix. Keep the user in control; do not silently rewrite signed terms or represent AI suggestions as legal advice. Make the interface distinguish suggestions from changes actually accepted into the agreement.

### J. Micro-interactions and states
- Gentle page/section entrance transitions; short press response on buttons; smooth tab/accordion transitions.
- Skeleton loading where layouts benefit; concise empty states with the next useful action; toast/inline feedback for success or failure.
- Celebrate only a verified completion or verified payment, with a subtle optional success animation. Never celebrate a mere wallet prompt or broadcast as if funds were confirmed.
- Prevent double clicks while an operation is pending, but preserve recovery paths when the provider returns an ambiguous result.
- Add clear focus states, keyboard access, accessible status text, and reduced-motion fallback.

## 21. UI implementation acceptance criteria

Before marking a UI task `DONE AND VERIFIED`:
- [ ] Actual current app components and styles were audited first.
- [ ] New components use real application data and handlers.
- [ ] No controls are decorative-only; every actionable control performs its stated function.
- [ ] No fake balances, user counts, ratings, payment results, campaign activity, or testimonials.
- [ ] Agreement/signature visuals reflect the actual current agreement state and digest.
- [ ] Payment visual state comes from authoritative server state, not optimistic client assumptions.
- [ ] Light and dark modes look intentional if both are provided.
- [ ] Layouts checked at 375px and desktop widths with no horizontal overflow.
- [ ] Keyboard focus, accessible labels, contrast, and reduced-motion behavior checked.
- [ ] Visual components do not interfere with Nimiq Pay SDK initialization or its supported wallet experience.
- [ ] No serious console errors, broken links, dead buttons, or production build regression.
- [ ] `npm run verify` and production build passed, or exact blockers/results were documented.

## 22. UI execution prompt for Claude Code

Use the following implementation brief after the core correctness audit. The visual pass must not destabilize the payment flow.

> Read `docs/CYCLE_III_EXECUTION.md` fully before starting, then inspect the existing Pact UI, all relevant components, styles, assets, current `package.json`, and Git changes. Do not assume the public README perfectly reflects the current branch.
>
> I want Pact to feel like a premium Apple-inspired fintech product with selective Liquid Glass styling, thoughtful motion, and a consistent design system. This is a web implementation inspired by Apple's visual principles, not native SwiftUI Liquid Glass.
>
> Preserve Pact's existing Next.js, Tailwind, React, Nimiq SDK, payment, signing, and Supabase architecture. Verify dependencies before adding any. The repo already appears to use Tailwind and Framer Motion, so prefer them. Research Apple Materials guidance, shadcn/ui, Magic UI, 21st.dev, Aceternity UI, React Bits, and Motion accessibility guidance, but select only components that solve a real need. Do not install every library or rewrite the app just to use a design system.
>
> Audit first. Make a short UI inventory and implementation plan, then immediately start implementing the highest-value safe changes. Build the visual system from shared tokens/components. Use Liquid Glass-inspired blur/translucency on selected navigation, wallet capsules, role-selection panels, and transient controls only. Keep contract content, campaign information, budget numbers, payment status, and transaction details on clear, high-contrast surfaces. Avoid heavy blur on every card, noisy neon, excessive gradients, and background effects that reduce legibility.
>
> Prioritize: (1) polished wallet entry and Brand/Contributor role selection, (2) a premium responsive mobile navigation and useful desktop navigation, (3) campaign marketplace cards and filters wired to real data, (4) Pact Seal/fingerprint based on the real agreement digest, (5) agreement/submission/revision/payment timeline using actual stored state, (6) payment receipt and verification states tied to the authoritative server response, and (7) role-specific dashboard summaries that use real data. Improve Smart Review presentation if time permits. Do not remove useful existing features to make the interface simpler.
>
> Use subtle Framer Motion interactions for entrances, press states, tab switches, accordions, and verified success. Respect reduced motion. Optimize for 375px mobile layouts as well as desktop. Keep forms, balances, terms, token units, and transaction references exceptionally readable. Do not make a user think funds are held or a payment succeeded unless that is verified. Do not add fake data, fake chart values, fake testimonials, or nonfunctional controls.
>
> Implement in small checkpoints. After each checkpoint run relevant tests, inspect the resulting UI, run `npm run verify` and the production build when appropriate, fix regressions, and update this file's status table and dated work log. List exact files changed and test results. Keep the product buildable and preserve user changes. If an effect is too expensive or harms usability, remove it rather than forcing it in.
>
> Start by auditing the current UI and implementing the wallet onboarding/role choice first, then continue through the high-value visual tasks. Do not stop at a moodboard or plan; ship the working UI changes and verify them.


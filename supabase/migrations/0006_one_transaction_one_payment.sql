-- One on-chain transaction settles at most one payment.
--
-- Until now nothing tied a transaction reference to a single payment, so one real payment
-- could be presented as the proof for any number of agreements. The check lives in the
-- database rather than only in application code for the usual reason: two requests racing
-- to confirm the same reference are exactly the case an application-level check loses.
--
-- Partial on CONFIRMED rather than on every status. A SUBMITTED payment is only a claim
-- that a transaction exists, and PACT verifies it against the chain before anything
-- becomes CONFIRMED, so a stray or malicious SUBMITTED reference should not be able to
-- block the genuine payer from ever confirming theirs.
create unique index payments_confirmed_tx_unique
  on pact.payments (tx_reference)
  where status = 'CONFIRMED' and tx_reference is not null;

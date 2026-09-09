-- Disputes.
--
-- `pacts.status = 'DISPUTED'` already existed and was already reachable, but it carried
-- no information: the UI flipped the status and the other side was told only that "an
-- issue was raised". That is the moment in this product where a person most needs to know
-- what is going on, and it was the one moment PACT said nothing.
--
-- Shaped deliberately like `negotiations`, because it is the same kind of object: one
-- party raises something, the other party sees it, and it resolves or it doesn't. Same
-- one-open-at-a-time rule for the same reason — so no screen ever has to ask which of two
-- open disputes it should be showing.
--
-- What this is not: arbitration. PACT records that two people disagree and what each said.
-- It does not decide who is right, and no code here moves money as a result.

create type pact.dispute_reason as enum (
  'NOT_DELIVERED',
  'NOT_AS_AGREED',
  'LATE',
  'PAYMENT_MISSING',
  'OTHER'
);

create type pact.dispute_status as enum ('OPEN', 'RESOLVED', 'WITHDRAWN');

create table pact.disputes (
  id          uuid primary key default gen_random_uuid(),
  pact_id     uuid not null references pact.pacts(id) on delete cascade,
  raised_by   text not null references pact.users(address),
  reason      pact.dispute_reason not null,
  -- The raiser's own account, shown to the counterparty verbatim. Bounded like every
  -- other free-text column so a 10MB "explanation" is not a denial-of-service.
  detail      text not null check (char_length(detail) between 1 and 1000),
  status      pact.dispute_status not null default 'OPEN',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,

  -- A resolved dispute must say when, and an open one must not pretend it was.
  constraint resolution_is_complete check (
    (status = 'OPEN' and resolved_at is null) or (status <> 'OPEN' and resolved_at is not null)
  )
);

create index disputes_pact_idx on pact.disputes (pact_id);
create index disputes_raised_by_idx on pact.disputes (raised_by);
-- At most one open dispute per agreement, so the UI never has to pick between two.
create unique index disputes_one_open_per_pact on pact.disputes (pact_id) where status = 'OPEN';

-- Same posture as every other table: enabled, no policies, service role only.
alter table pact.disputes enable row level security;

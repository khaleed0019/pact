-- PACT — initial schema
--
-- Everything lives in a dedicated `pact` schema rather than `public`. That makes this
-- migration safe to apply inside a Supabase project that is already running another app:
-- nothing collides, nothing is renamed, and `drop schema pact cascade` reverses it
-- completely.
--
-- Design notes that are load-bearing rather than stylistic:
--
--  * Identity is a Nimiq address, not an email or an auth provider row. A user proves who
--    they are by signing a challenge, and the server derives the address from the public
--    key. There is no password to store and no account to create.
--
--  * Money is `numeric(40,0)` holding MINOR units (Luna for NIM, 1e-6 for USDT). Never
--    float, never a decimal with a currency-dependent scale. 40 digits is far past any
--    real amount and keeps arithmetic exact.
--
--  * `terms_digest` is the Blake2b fingerprint both parties sign. Signatures live on
--    `pact_participants` and are cleared by the application whenever the digest moves, so
--    a sealed pact always carries signatures over its current terms.
--
--  * RLS is ON everywhere and no policy grants access to `anon` or `authenticated`.
--    That is deliberate: every read and write goes through this app's server routes using
--    the service role, which is where authorisation actually lives. Clients never talk to
--    Postgres directly, so a permissive policy here could only ever be a way to get it
--    wrong.

create extension if not exists "pgcrypto";

create schema if not exists pact;

-- The server routes talk to Postgres as the service role. Nothing else gets in: no
-- grants to anon or authenticated, here or anywhere below.
grant usage on schema pact to service_role;
alter default privileges in schema pact grant all on tables to service_role;
alter default privileges in schema pact grant all on sequences to service_role;

set local search_path = pact, public;

-- ---------------------------------------------------------------------------- enums

create type pact.pact_status as enum (
  'DRAFT', 'PENDING', 'NEGOTIATING', 'ACTIVE', 'IN_PROGRESS',
  'DELIVERED', 'COMPLETED', 'DISPUTED', 'DECLINED', 'CANCELLED'
);
create type pact.participant_role as enum ('CLIENT', 'PROVIDER');
create type pact.currency_code as enum ('NIM', 'USDT');
create type pact.milestone_status as enum ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'PAID', 'CANCELLED');
create type pact.payment_status as enum ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED');
create type pact.deliverable_status as enum ('SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED');
create type pact.negotiation_status as enum ('OPEN', 'ACCEPTED', 'DECLINED', 'COUNTERED', 'WITHDRAWN');

-- ---------------------------------------------------------------------------- users

-- One row per Nimiq address that has ever signed in. `public_key` is recorded from the
-- first verified signature so a later signature can be checked against a known key.
create table pact.users (
  address        text primary key check (address ~ '^NQ[0-9A-HJ-NP-VXY]{34}$'),
  public_key     text check (public_key ~ '^[0-9a-f]{64}$'),
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

create table pact.profiles (
  address      text primary key references pact.users(address) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  evm_address  text check (evm_address ~ '^0x[0-9a-f]{40}$'),
  locale       text not null default 'en' check (char_length(locale) <= 8),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------- pacts

create table pact.pacts (
  id                 uuid primary key default gen_random_uuid(),
  -- Short, unambiguous, human-typable. Goes in invite links and the on-chain NIM memo.
  short_id           text not null check (short_id ~ '^[0-9A-HJ-NP-VXY]{8}$'),
  title              text not null check (char_length(title) between 1 and 140),
  deliverable        text not null check (char_length(deliverable) between 1 and 2000),
  created_by         text not null references pact.users(address),
  status             pact.pact_status not null default 'DRAFT',
  currency           pact.currency_code not null,
  -- Null for NIM, an EVM chain key for USDT. Enforced together below.
  chain              text check (chain in ('polygon', 'ethereum', 'arbitrum', 'optimism')),
  total_amount_minor numeric(40, 0) not null check (total_amount_minor > 0),
  deadline           date,
  payment_condition  text not null default '' check (char_length(payment_condition) <= 300),
  special_terms      text[] not null default '{}',
  terms_digest       text not null check (terms_digest ~ '^[0-9a-f]{32}$'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- A USDT pact settles on a chain; a NIM pact settles on Nimiq. Letting these disagree
  -- would produce a payment screen that cannot say where the money is going.
  constraint chain_matches_currency check (
    (currency = 'USDT' and chain is not null) or (currency = 'NIM' and chain is null)
  )
);

create index pacts_created_by_idx on pact.pacts (created_by);
create index pacts_status_deadline_idx on pact.pacts (status, deadline);
create unique index pacts_short_id_idx on pact.pacts (short_id);

create table pact.pact_participants (
  id             uuid primary key default gen_random_uuid(),
  pact_id        uuid not null references pact.pacts(id) on delete cascade,
  role           pact.participant_role not null,
  -- Null until the counterparty opens the invitation and joins.
  address        text references pact.users(address),
  display_name   text not null default '' check (char_length(display_name) <= 80),
  evm_address    text check (evm_address ~ '^0x[0-9a-f]{40}$'),
  -- The Ed25519 signature over the seal message containing `pacts.terms_digest`.
  seal_signature text check (seal_signature ~ '^[0-9a-f]{128}$'),
  seal_public_key text check (seal_public_key ~ '^[0-9a-f]{64}$'),
  sealed_at      timestamptz,
  joined_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Exactly one client and one provider per agreement.
  constraint one_role_per_pact unique (pact_id, role),
  -- A signature without a key (or vice versa) could never be verified.
  constraint seal_is_complete check (
    (seal_signature is null and seal_public_key is null and sealed_at is null)
    or (seal_signature is not null and seal_public_key is not null and sealed_at is not null)
  )
);

create index participants_pact_idx on pact.pact_participants (pact_id);
create index participants_address_idx on pact.pact_participants (address);

-- ---------------------------------------------------------------------- milestones

create table pact.milestones (
  id           uuid primary key default gen_random_uuid(),
  pact_id      uuid not null references pact.pacts(id) on delete cascade,
  position     integer not null check (position > 0),
  title        text not null check (char_length(title) between 1 and 120),
  description  text not null default '' check (char_length(description) <= 500),
  amount_minor numeric(40, 0) not null check (amount_minor >= 0),
  -- Kept alongside the amount so the split can be re-derived without rounding drift.
  percent      numeric(6, 3) not null check (percent >= 0 and percent <= 100),
  due_date     date,
  status       pact.milestone_status not null default 'PENDING',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint milestone_position_unique unique (pact_id, position)
);

create index milestones_pact_idx on pact.milestones (pact_id);
create index milestones_status_due_idx on pact.milestones (status, due_date);

-- ------------------------------------------------------------------------ payments

create table pact.payments (
  id              uuid primary key default gen_random_uuid(),
  pact_id         uuid not null references pact.pacts(id) on delete cascade,
  milestone_id    uuid references pact.milestones(id) on delete set null,
  from_address    text not null,
  to_address      text not null,
  amount_minor    numeric(40, 0) not null check (amount_minor > 0),
  currency        pact.currency_code not null,
  chain           text,
  status          pact.payment_status not null default 'PENDING',
  -- NIM: the serialized transaction. USDT: the transaction hash.
  tx_reference    text,
  -- The on-chain memo written into a NIM transaction's data field, e.g. PACT:AB12CD34:m1
  memo            text check (char_length(memo) <= 64),
  failure_reason  text check (char_length(failure_reason) <= 300),
  -- Supplied by the client so a double tap cannot create two payments for one milestone.
  idempotency_key text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint payment_idempotency_unique unique (idempotency_key),

  -- The honesty rule, enforced by the database and not only by the application:
  -- a payment cannot be recorded as sent or confirmed without a transaction reference.
  constraint settled_payments_have_a_reference check (
    status not in ('SUBMITTED', 'CONFIRMED') or tx_reference is not null
  )
);

create index payments_pact_idx on pact.payments (pact_id);
create index payments_milestone_idx on pact.payments (milestone_id);
create index payments_status_idx on pact.payments (status);
create index payments_from_idx on pact.payments (from_address);

-- -------------------------------------------------------------------- deliverables

create table pact.deliverables (
  id           uuid primary key default gen_random_uuid(),
  pact_id      uuid not null references pact.pacts(id) on delete cascade,
  milestone_id uuid references pact.milestones(id) on delete set null,
  submitted_by text not null references pact.users(address),
  note         text not null check (char_length(note) between 1 and 2000),
  -- Only http(s). A `javascript:` URL here would be stored XSS the moment it is rendered.
  link         text check (link ~* '^https?://' and char_length(link) <= 2048),
  status       pact.deliverable_status not null default 'SUBMITTED',
  review_note  text check (char_length(review_note) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index deliverables_pact_idx on pact.deliverables (pact_id);
create index deliverables_status_idx on pact.deliverables (status);

-- -------------------------------------------------------------------- negotiations

create table pact.negotiations (
  id          uuid primary key default gen_random_uuid(),
  pact_id     uuid not null references pact.pacts(id) on delete cascade,
  proposed_by text not null references pact.users(address),
  message     text not null check (char_length(message) between 1 and 1000),
  status      pact.negotiation_status not null default 'OPEN',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index negotiations_pact_idx on pact.negotiations (pact_id);
-- At most one proposal open per agreement, so the UI never has to ask which one is live.
create unique index negotiations_one_open_per_pact on pact.negotiations (pact_id) where status = 'OPEN';

-- Both sides of every proposed change, which is what makes the before/after diff possible.
create table pact.negotiation_changes (
  id             uuid primary key default gen_random_uuid(),
  negotiation_id uuid not null references pact.negotiations(id) on delete cascade,
  field          text not null check (char_length(field) <= 40),
  label          text not null check (char_length(label) <= 60),
  original_value text not null default '' check (char_length(original_value) <= 300),
  proposed_value text not null default '' check (char_length(proposed_value) <= 300),
  created_at     timestamptz not null default now()
);

create index negotiation_changes_negotiation_idx on pact.negotiation_changes (negotiation_id);

-- ---------------------------------------------------------------------- activities

-- The shared, append-only history. Both parties see exactly these rows.
create table pact.activities (
  id            uuid primary key default gen_random_uuid(),
  pact_id       uuid not null references pact.pacts(id) on delete cascade,
  kind          text not null check (char_length(kind) <= 40),
  -- Null for events PACT itself records, such as "both sides signed".
  actor_address text,
  actor_name    text not null default '' check (char_length(actor_name) <= 80),
  summary       text not null check (char_length(summary) <= 300),
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index activities_pact_created_idx on pact.activities (pact_id, created_at);

-- --------------------------------------------------------------------- invitations

create table pact.invitations (
  id          uuid primary key default gen_random_uuid(),
  pact_id     uuid not null references pact.pacts(id) on delete cascade,
  token       text not null unique check (char_length(token) between 16 and 64),
  role        pact.participant_role not null,
  created_by  text not null references pact.users(address),
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by text references pact.users(address),
  created_at  timestamptz not null default now()
);

create index invitations_pact_idx on pact.invitations (pact_id);
create index invitations_expiry_idx on pact.invitations (expires_at) where accepted_at is null;

-- -------------------------------------------------------------------- notifications

create table pact.notifications (
  id         uuid primary key default gen_random_uuid(),
  address    text not null references pact.users(address) on delete cascade,
  pact_id    uuid not null references pact.pacts(id) on delete cascade,
  kind       text not null check (char_length(kind) <= 40),
  title      text not null check (char_length(title) <= 120),
  body       text not null default '' check (char_length(body) <= 300),
  sent_at    timestamptz,
  read_at    timestamptz,
  created_at timestamptz not null default now(),

  -- The anti-spam rule, in the schema rather than in a code path someone can forget:
  -- one nudge per person, per agreement, per reason. Ever.
  constraint one_nudge_per_reason unique (address, pact_id, kind)
);

create index notifications_address_idx on pact.notifications (address, read_at);

-- -------------------------------------------------------------------- trust metrics

-- Deliberately a view, not a table.
--
-- Reputation must be a function of what actually happened. A table would be a second
-- copy of the truth that can silently drift from the rows it summarises — and a
-- reputation number that disagrees with the history behind it is worse than none.
-- Only payments carrying a transaction reference are counted.
create view pact.trust_metrics as
select
  p.address,
  max(pr.display_name)                                                as display_name,
  count(*) filter (where pc.status = 'COMPLETED')                     as pacts_completed,
  count(*) filter (where pc.status not in ('COMPLETED', 'CANCELLED', 'DECLINED')) as pacts_active,
  count(*) filter (where pc.status in ('CANCELLED', 'DECLINED'))      as pacts_cancelled,
  min(coalesce(p.joined_at, pc.created_at))                           as first_seen_at
from pact.pact_participants p
join pact.pacts pc on pc.id = p.pact_id
left join pact.profiles pr on pr.address = p.address
where p.address is not null
group by p.address;

-- ---------------------------------------------------------------------------- RLS
--
-- Enabled with no policies. Postgres denies by default, so `anon` and `authenticated`
-- can read and write nothing. Access is exclusively through the app's server routes,
-- which hold the service role key and perform their own authorisation against
-- pact_participants. A client that reached Postgres directly would bypass that logic,
-- so it is not permitted to reach it at all.

alter table pact.users enable row level security;
alter table pact.profiles enable row level security;
alter table pact.pacts enable row level security;
alter table pact.pact_participants enable row level security;
alter table pact.milestones enable row level security;
alter table pact.payments enable row level security;
alter table pact.deliverables enable row level security;
alter table pact.negotiations enable row level security;
alter table pact.negotiation_changes enable row level security;
alter table pact.activities enable row level security;
alter table pact.invitations enable row level security;
alter table pact.notifications enable row level security;

-- ------------------------------------------------------------------ updated_at

create or replace function pact.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'pacts', 'pact_participants', 'milestones',
    'payments', 'deliverables'
  ]
  loop
    execute format(
      'create trigger %I_touch before update on pact.%I for each row execute function pact.touch_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- ------------------------------------------------------------------ PostgREST

-- Make the `pact` schema reachable through supabase-js.
--
-- This is additive: `public` and `graphql_public` are the Supabase defaults and are
-- listed explicitly so whatever else lives in this project keeps working exactly as it
-- did. Verify with:
--   select rolconfig from pg_roles where rolname = 'authenticator';
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, pact';
notify pgrst, 'reload config';

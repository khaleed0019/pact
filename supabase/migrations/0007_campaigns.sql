-- Campaigns: a brand posts work with a fixed reward, and each person who takes it up gets
-- their own two-party PACT.
--
-- A campaign is deliberately not a new kind of money object. It holds the offer (brief,
-- requirements, reward, how many people can take it up); everything after someone takes
-- it up — signing, delivering, reviewing, paying — is the existing pact, so it gets the
-- same seals, the same chain-verified payments and the same honest timeline.
--
-- Nothing here holds or reserves funds. "Budget" is reward x slots: what the brand has
-- said it will pay, not money set aside. The schema has no column that could say otherwise.

create type pact.campaign_status as enum ('OPEN', 'PAUSED', 'CLOSED', 'CANCELLED');

create table pact.campaigns (
  id             uuid primary key default gen_random_uuid(),
  owner_address  text not null references pact.users(address) on delete cascade,
  owner_name     text not null check (char_length(owner_name) between 1 and 80),
  title          text not null check (char_length(title) between 1 and 140),
  brief          text not null check (char_length(brief) between 1 and 2000),
  requirements   text[] not null default '{}' check (cardinality(requirements) <= 12),
  currency       pact.currency_code not null,
  chain          text,
  reward_minor   numeric(40, 0) not null check (reward_minor > 0),
  slots          integer not null check (slots between 1 and 500),
  deadline       date,
  status         pact.campaign_status not null default 'OPEN',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint campaign_chain_matches_currency check ((currency = 'USDT') = (chain is not null))
);

create index campaigns_owner_idx on pact.campaigns(owner_address);
create index campaigns_open_idx on pact.campaigns(created_at desc) where status = 'OPEN';

create table pact.campaign_claims (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references pact.campaigns(id) on delete cascade,
  jobber_address text not null references pact.users(address) on delete cascade,
  -- Null only for the instant between reserving the slot and creating the agreement.
  pact_id        uuid references pact.pacts(id) on delete set null,
  created_at     timestamptz not null default now(),
  -- One claim per person per campaign, enforced here and not only in the app.
  constraint one_claim_per_person unique (campaign_id, jobber_address)
);

create index campaign_claims_jobber_idx on pact.campaign_claims(jobber_address);
create index campaign_claims_pact_idx on pact.campaign_claims(pact_id);

alter table pact.campaigns enable row level security;
alter table pact.campaign_claims enable row level security;

create trigger campaigns_touch before update on pact.campaigns
  for each row execute function pact.touch_updated_at();

-- Reserve one slot. PostgREST has no transactions, so "is there room, and is it still
-- open" and "take the room" have to be one statement; the row lock on the campaign makes
-- two people racing for the last slot take turns instead of both winning.
create or replace function pact.claim_campaign_slot(p_campaign uuid, p_jobber text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c pact.campaigns%rowtype;
  taken integer;
  new_id uuid;
begin
  select * into c from pact.campaigns where id = p_campaign for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if c.status <> 'OPEN' then raise exception 'CAMPAIGN_NOT_OPEN'; end if;
  if c.deadline is not null and c.deadline < current_date then raise exception 'CAMPAIGN_EXPIRED'; end if;
  if c.owner_address = p_jobber then raise exception 'OWN_CAMPAIGN'; end if;

  -- A slot comes back if the agreement made from it was declined or cancelled.
  select count(*) into taken
  from pact.campaign_claims cc
  left join pact.pacts p on p.id = cc.pact_id
  where cc.campaign_id = p_campaign
    and (p.id is null or p.status not in ('DECLINED', 'CANCELLED'));
  if taken >= c.slots then raise exception 'CAMPAIGN_FULL'; end if;

  insert into pact.campaign_claims (campaign_id, jobber_address)
  values (p_campaign, p_jobber)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function pact.claim_campaign_slot(uuid, text) from public;
grant execute on function pact.claim_campaign_slot(uuid, text) to service_role;

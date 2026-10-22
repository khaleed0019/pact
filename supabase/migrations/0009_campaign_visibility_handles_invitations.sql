-- Public and private campaigns, Pact handles, and direct invitations.
--
-- All additive. Existing campaigns keep working: they become PUBLIC, category OTHER, with
-- empty submission instructions and platform and no revision limit — which is exactly how
-- they behaved before this migration. No row is rewritten beyond those defaults.

-- --------------------------------------------------------------- campaign fields

alter table pact.campaigns
  add column visibility text not null default 'PUBLIC' check (visibility in ('PUBLIC', 'PRIVATE')),
  add column category text not null default 'OTHER' check (category in ('VIDEO', 'DESIGN', 'SOCIAL', 'WRITING', 'OTHER')),
  add column submission_instructions text not null default '' check (char_length(submission_instructions) <= 300),
  add column platform text not null default '' check (char_length(platform) <= 40),
  add column revision_limit integer check (revision_limit between 0 and 10);

-- The marketplace only ever lists open PUBLIC campaigns; index exactly that.
drop index if exists pact.campaigns_open_idx;
create index campaigns_public_open_idx on pact.campaigns (created_at desc)
  where status = 'OPEN' and visibility = 'PUBLIC';

-- --------------------------------------------------------------- handles

-- A handle is a name to find someone by, set by the signed-in wallet that owns the
-- profile. Lowercase, starts with a letter, 3–20 of [a-z0-9_]. Unique when present.
alter table pact.profiles
  add column handle text check (handle ~ '^[a-z][a-z0-9_]{2,19}$'),
  add column categories text[] not null default '{}' check (cardinality(categories) <= 5),
  add column links text[] not null default '{}' check (cardinality(links) <= 4);

create unique index profiles_handle_unique on pact.profiles (handle) where handle is not null;

-- --------------------------------------------------------------- invitations

-- An invitation is an offer to one specific address. It signs nothing and creates no
-- agreement; accepting it runs the ordinary claim, which creates the pact both sides
-- then sign. A handle invite is resolved to an address when it is sent, so whoever owns
-- that wallet — and only them — can open it.
create table pact.campaign_invitations (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references pact.campaigns(id) on delete cascade,
  invitee_address text not null references pact.users(address) on delete cascade,
  invited_by      text not null references pact.users(address) on delete cascade,
  via             text not null check (via in ('HANDLE', 'ADDRESS')),
  status          text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED')),
  pact_id         uuid references pact.pacts(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint one_invitation_per_person unique (campaign_id, invitee_address)
);

create index campaign_invitations_invitee_idx on pact.campaign_invitations (invitee_address, status);

alter table pact.campaign_invitations enable row level security;

create trigger campaign_invitations_touch before update on pact.campaign_invitations
  for each row execute function pact.touch_updated_at();

-- Product role: Brand or Contributor.
--
-- Stored on the existing one-row-per-address profile, so choosing or switching a role can
-- never create a second profile for the same wallet. Nullable on purpose: null means
-- "has not chosen yet", which is what triggers the first-run role screen.
--
-- The role decides which dashboard you see and which campaign actions the server accepts.
-- It does not change any agreement already made — CLIENT and PROVIDER live on the pact.

alter table pact.profiles
  add column role text check (role in ('BRAND', 'CONTRIBUTOR')),
  add column role_chosen_at timestamptz;

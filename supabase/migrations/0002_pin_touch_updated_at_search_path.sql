-- Pin touch_updated_at's search_path.
--
-- Supabase's own security advisor flags any function without an explicit search_path as
-- mutable: a caller in a session that has reassigned search_path could make this trigger
-- resolve "now()" or its own table references against a different schema than intended.
-- The function does not depend on the caller's search_path for anything, so pinning it
-- costs nothing and closes the gap the advisor is pointing at.

alter function pact.touch_updated_at() set search_path = pact, pg_catalog;

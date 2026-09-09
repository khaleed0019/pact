-- Pact visibility.
--
-- Until now every pact was implicitly private: `getPactById` is only ever reached through
-- a route that checks membership first, so a non-participant could not read one at all.
-- That is the right default and it stays the default. What was missing is the deliberate
-- opposite — a way for the two parties to point at a finished agreement and let a third
-- person confirm it happened.
--
-- Three levels, and the gap between the second and third is the important one:
--
--   PRIVATE   Participants only. Unchanged behaviour, and still what every pact gets.
--   SHAREABLE Anyone holding the link can verify it. Not listed anywhere, not guessable
--             — the short_id is 8 crockford characters, so the URL is the capability.
--   PUBLIC    As shareable, and additionally may be listed in a discovery surface.
--
-- Note what SHAREABLE deliberately does not expose: the verification view built on this
-- column shows the terms digest, the signatures, the status and the dates, but never the
-- participants' full addresses, the deliverable notes, or the payment references. "This
-- agreement existed, said this, and both people signed it" is verifiable without handing
-- a stranger the contents of someone's working relationship.

create type pact.pact_visibility as enum ('PRIVATE', 'SHAREABLE', 'PUBLIC');

alter table pact.pacts
  add column visibility pact.pact_visibility not null default 'PRIVATE';

-- Only the non-private ones are ever looked up by this path, so the index covers exactly
-- those rows rather than the whole table.
create index pacts_visibility_idx on pact.pacts (visibility) where visibility <> 'PRIVATE';

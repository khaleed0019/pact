-- Pact categories, and the constraint that had to move to allow two of them.
--
-- Until now every pact was implicitly a freelance job: the schema required a positive
-- amount, and the UI called the two sides "Paying" and "Delivering". That is right for
-- the case this product was built around and wrong for an agreement with no money in it
-- — "I'll have the draft finished by the 30th, and Sam is holding me to it" is the same
-- object in every respect except that nobody pays anybody.
--
-- So `total_amount_minor > 0` becomes `>= 0`. Zero means "money is not part of this
-- agreement", which the payment surfaces read as nothing to pay rather than as an
-- invitation to send zero. It is deliberately not nullable: forty call sites treat this
-- as a string amount, and making it optional would push a null check into every one of
-- them to express something a zero already says.
--
-- No GROUP category. One CLIENT and one PROVIDER per pact is enforced by
-- `one_role_per_pact`, and the digest both parties sign is computed over exactly two
-- participants — a group agreement is a different object, not a flag on this one.

create type pact.pact_category as enum ('FREELANCE', 'PAYMENT', 'COMMITMENT', 'CHALLENGE');

alter table pact.pacts
  add column category pact.pact_category not null default 'FREELANCE';

alter table pact.pacts
  drop constraint pacts_total_amount_minor_check;

alter table pact.pacts
  add constraint pacts_total_amount_minor_check check (total_amount_minor >= 0);

-- A money-free agreement must not carry a currency-specific chain, and a paid one still
-- has to obey the original rule. Kept as one constraint so the two can't drift.
alter table pact.pacts
  add constraint payment_free_categories_have_no_amount check (
    category in ('FREELANCE', 'PAYMENT') or total_amount_minor = 0
  );

create index pacts_category_idx on pact.pacts (category);

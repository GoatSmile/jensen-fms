-- 123 · Payment terms follow a rule, not a column default (DECISIONS 2026-10-07)
--
-- Dennis: every municipality pays at 30 days; a customer without an EAN
-- should pay at 8 as standard; companies are otherwise decided case by case.
-- The column defaulted to 14 since migration 01, and the customer import never
-- set it, so the 14 on every row was nobody's choice. NULL now means "follow
-- the rule" — resolvePaymentTermsDays (src/lib/invoicing/status.ts): 30 days
-- for a public customer (EAN, municipality or hospital), else 8. A figure set
-- on the customer still wins. Surveyed 2026-10-07: 530 rows at 14, one at 8
-- (kept — deliberate), two NULL.

ALTER TABLE organizations ALTER COLUMN payment_terms_days DROP DEFAULT;

UPDATE organizations SET payment_terms_days = NULL WHERE payment_terms_days = 14;

COMMENT ON COLUMN organizations.payment_terms_days IS
  'Days to pay, when agreed with this customer. NULL = the rule: 30 for a public customer (EAN, municipality, hospital), else 8 — resolvePaymentTermsDays.';

insert into public.schema_migrations (version, name)
  values (123, '123_payment_terms_rule') on conflict (version) do nothing;

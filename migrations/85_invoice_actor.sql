-- ============================================================================
-- 85 — Who issued the invoice, and who recorded the payment
-- ============================================================================
-- Issuing is the moment an invoice number is allocated and the row becomes
-- immutable (corrections are credit notes). It is worth a name.
--
-- ONE column each, not the performer/recorder pair used for builds and
-- repairs: whoever clicks Issue IS the person issuing it, and whoever records
-- a payment IS the person recording it. A second field there would be
-- friction with no information in it. The pair exists only where the work and
-- the typing genuinely come apart — a mechanic who does not log in.
--
-- Credit notes are `invoices` rows of their own kind, so `issued_by` covers
-- them with no extra column.

ALTER TABLE invoices
    ADD COLUMN issued_by           UUID REFERENCES people(id),
    ADD COLUMN payment_recorded_by UUID REFERENCES people(id);

COMMENT ON COLUMN invoices.issued_by IS
    'Who allocated the INV number. NULL on invoices issued before attribution.';
COMMENT ON COLUMN invoices.payment_recorded_by IS
    'Who marked it paid — a record of the entry, not proof of payment.';

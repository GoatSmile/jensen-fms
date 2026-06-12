-- 37: invoicing slice 5 — recurring agreement fees + credit notes.
--
-- Agreement fee invoicing is per-customer (one invoice, many agreements),
-- so the agreement/period linkage lives on invoice LINES, not the header.
-- "Billed through" for an agreement = max(billing_period_end) over its
-- lines on invoices that are neither cancelled nor credited (and that are
-- not themselves credit notes).
--
-- Credit notes are full reversals: a credit note is an invoice row whose
-- credited_invoice_id points at the original. The partial unique index
-- allows a cancelled credit-note draft to be replaced, but at most one
-- live credit note per invoice.

ALTER TABLE invoice_lines
    ADD COLUMN service_agreement_id UUID REFERENCES service_agreements(id),
    ADD COLUMN billing_period_start DATE,
    ADD COLUMN billing_period_end DATE;

COMMENT ON COLUMN invoice_lines.service_agreement_id IS
    'Recurring-fee lines: the agreement this line bills.';
COMMENT ON COLUMN invoice_lines.billing_period_start IS
    'Fee lines: first day of the billed period (inclusive).';
COMMENT ON COLUMN invoice_lines.billing_period_end IS
    'Fee lines: last day of the billed period (inclusive).';

CREATE INDEX idx_invoice_lines_agreement_period
    ON invoice_lines (service_agreement_id, billing_period_end)
    WHERE service_agreement_id IS NOT NULL;

ALTER TABLE invoices
    ADD COLUMN credited_invoice_id UUID REFERENCES invoices(id);

COMMENT ON COLUMN invoices.credited_invoice_id IS
    'Credit notes: the issued invoice this note reverses (full reversal, v1).';

CREATE UNIQUE INDEX uq_invoices_live_credit_note
    ON invoices (credited_invoice_id)
    WHERE credited_invoice_id IS NOT NULL AND status <> 'cancelled';

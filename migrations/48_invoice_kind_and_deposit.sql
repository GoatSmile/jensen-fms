-- Tier 4 — deposit / final invoices.
--
-- A single gapless INV-YYYY-NNNN series still numbers ALL real invoices
-- (deposits and finals included) — only credit notes use the separate CRE
-- series. `kind` distinguishes:
--   standard — an ordinary one-shot invoice (today's behaviour; the default)
--   deposit  — a down payment taken before delivery (acontofaktura)
--   final    — the settlement invoice (slutfaktura): order total minus the
--              deposits already invoiced, modelled as negative deduction lines
--
-- deposit_pct records the percentage a %-based deposit was struck at (for the
-- line text + the order "% invoiced" surface); NULL for amount-based deposits
-- and for non-deposit invoices.
ALTER TABLE invoices
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard'
    CHECK (kind IN ('standard', 'deposit', 'final')),
  ADD COLUMN deposit_pct NUMERIC(5,2)
    CHECK (deposit_pct IS NULL OR (deposit_pct > 0 AND deposit_pct <= 100));

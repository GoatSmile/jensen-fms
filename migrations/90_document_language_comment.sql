-- ============================================================================
-- 90 — suppliers.document_language drives purchase orders too (comment only)
-- ============================================================================
-- Migration 89 said POs would stay English "until taught otherwise". They were
-- taught the same day (DECISIONS 2026-09-02, later). No schema change — only
-- the column comment, so the database does not describe behaviour that is
-- no longer true. Apply to BOTH databases.

comment on column public.suppliers.document_language is
  'Language every supplier-facing document renders in — purchase orders and paint orders, print and email. A fact about the recipient, not the UI locale.';

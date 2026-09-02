-- ============================================================================
-- 89 — The painter gets a document: per-supplier language + the emailed stamp
-- ============================================================================
-- Until now "send" on a paint order was a status change that froze prices and
-- told nobody. The workshop handed the painter a hard copy written by hand;
-- the app had no artefact to hand over at all. Purchase orders have had both a
-- print view and an email-to-supplier since migration 57 — this brings service
-- orders level, with one addition the PO never needed.
--
--   1. `suppliers.document_language` — the language a supplier-facing document
--      renders in. Metacoat A/S reads Danish; Eastek HK does not. Per supplier
--      because it is a fact about the recipient, not about the person at the
--      keyboard, and not about the order. Default 'en' preserves today's
--      behaviour for every existing supplier: the PO document has always been
--      English, and stays so until it is taught to read this column.
--
--   2. `service_orders.emailed_at` / `emailed_to` — the purchase_orders
--      pattern (migration 57): last-send-wins stamp, "test:" prefix while
--      outbound test mode reroutes mail, so a rerouted send can never read as
--      a real one.
--
-- Apply to BOTH databases (production and the local copy).

alter table public.suppliers
  add column if not exists document_language char(2) not null default 'en'
    constraint suppliers_document_language_check
    check (document_language in ('en', 'da'));

comment on column public.suppliers.document_language is
  'Language supplier-facing documents render in (paint orders today; POs stay English until taught otherwise). A fact about the recipient, not the UI locale.';

alter table public.service_orders
  add column if not exists emailed_at timestamptz,
  add column if not exists emailed_to text;

comment on column public.service_orders.emailed_at is
  'When the order document was last emailed to the supplier (or to the test inboxes while outbound test mode is on). NULL = never emailed.';
comment on column public.service_orders.emailed_to is
  'Recipients of the last email, comma-separated; prefixed "test:" when outbound test mode rerouted it.';

-- Migration 54: Import-tax origin model (July-2 backlog items 2+3).
--
-- Dennis's rules: EU-origin parts carry no import tax; non-EU parts do —
-- unless the supplier delivered duty-paid (his Shimano case). Both concepts
-- only drive the DEFAULT of a new per-PO-line "Apply import tax" toggle;
-- the toggle drives the snapshotted tariff_pct / anti_dumping_pct to 0 when
-- off. The frozen-at-purchase contract is untouched: editing a part's origin
-- or a supplier's prepaid flag later never rewrites historical lines.
--
-- import_tax_basis freezes WHY the snapshot is what it is, alongside the
-- numbers. A derived reason can't be reconstructed later without reading
-- MUTABLE part/supplier/HS state — that would fabricate a historical
-- explanation (e.g. print "EU origin" for a line that was actually
-- supplier-prepaid at the time). Existing lines stay NULL = "pre-tracking".
-- See docs/plan-july2-meeting-backlog.md items 2+3.

alter table public.parts
  add column if not exists origin text
    check (origin in ('eu', 'non_eu'));

comment on column public.parts.origin is
  'Customs origin: eu | non_eu | NULL = unclassified. Drives the default of the per-PO-line "Apply import tax" toggle; the frozen cost basis lives on the PO line, not here.';

alter table public.suppliers
  add column if not exists import_duty_prepaid_default boolean not null default false;

comment on column public.suppliers.import_duty_prepaid_default is
  'Supplier delivers duty-paid (e.g. Shimano) — new PO lines for this supplier default to "Apply import tax" off. Overridable per line.';

alter table public.purchase_order_lines
  add column if not exists import_tax_basis text
    check (import_tax_basis in
      ('applied', 'zero_rated', 'unclassified', 'eu_origin', 'supplier_prepaid'));

comment on column public.purchase_order_lines.import_tax_basis is
  'Frozen-at-insert reason behind the tariff/anti-dumping snapshot: applied (positive rate) | zero_rated (deliberate 0 — 0% rate or manual un-check) | unclassified (origin/HS unknown, data-quality gap) | eu_origin | supplier_prepaid. NULL = line predates tracking (migration 54).';

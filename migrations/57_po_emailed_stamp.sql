-- Migration 57: stamp when a PO was last emailed to the supplier (Tier 3).
--
-- Last-send-wins columns, not a log: the workshop needs "has this PO gone
-- out, when, and to whom" at a glance. Re-sending overwrites the stamp.
-- (If a full send history is ever needed, that's an audit_log/table job.)

alter table public.purchase_orders
  add column if not exists emailed_at timestamptz,
  add column if not exists emailed_to text;

comment on column public.purchase_orders.emailed_at is
  'When the PO was last emailed to the supplier (or the test inboxes while outbound test mode is on). NULL = never sent.';
comment on column public.purchase_orders.emailed_to is
  'Comma-separated recipients of the last send. While test mode is on this records the TEST inboxes, prefixed "test:", so a rerouted send can''t read as a real one.';

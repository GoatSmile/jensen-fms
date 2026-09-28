-- 106 — paint orders separate the paperwork from where the goods are
--
-- Owner, 2026-09-28 (Dennis, 15 Sep 01:14–01:22). `sent` meant two things at
-- once: the order was emailed to the painter AND the goods were physically
-- away, so the moment Dennis emailed an order the frames counted as "at the
-- painter" and could not be built, while they sat in the workshop for days
-- until Finn drove them. The lifecycle becomes
--
--     planned → confirmed → at_supplier ("at painter") → ready → received_back
--                                                          (or cancelled)
--
--   * `sent` is RENAMED `confirmed`. Emailing (or *Mark as sent*) still moves
--     planned → confirmed and freezes the prices — "emailing IS the send" of
--     the paperwork is unchanged. The goods are still at Jensen.
--   * `at_supplier` is set on the planned drop-off date by a daily job
--     (/api/cron/paint-drop-offs), or by hand when Finn drops them off early.
--     `planned_send_date` is that drop-off date; `dropped_off_at` records when
--     it happened.
--   * `ready` (new): the painter said it is done. `ready_at` stamps it, and
--     `pickup_date` is the day Finn plans to collect — shown to everyone as
--     "pickup planned Thursday".
--   * The build is blocked from `at_supplier` on, not from `confirmed`.
--
-- `sent_at` keeps its name and now means "confirmed at" (the paperwork date).
-- "Packed" waits for the box labels (Dennis's label printer).
--
-- Production held no `sent` / `at_supplier` orders when this was written.

alter type public.service_order_status rename value 'sent' to 'confirmed';
alter type public.service_order_status add value if not exists 'ready' after 'at_supplier';

alter table public.service_orders
  add column if not exists dropped_off_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists pickup_date date;

comment on column public.service_orders.planned_send_date is
  'Planned DROP-OFF date at the supplier. A daily job moves a confirmed order to at_supplier on this date.';
comment on column public.service_orders.sent_at is
  'When the order was CONFIRMED to the supplier (emailed or marked sent; prices frozen). Not when the goods left.';
comment on column public.service_orders.dropped_off_at is
  'When the goods were handed to the supplier (status at_supplier).';
comment on column public.service_orders.ready_at is
  'When the supplier reported the order ready for pickup (status ready).';
comment on column public.service_orders.pickup_date is
  'The day the pickup is planned — shown on a ready order.';

insert into public.schema_migrations (version, name)
  values (106, '106_paint_order_lifecycle') on conflict (version) do nothing;

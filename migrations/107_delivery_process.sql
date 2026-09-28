-- 107 — the delivery process: who receives it, and a signature that delivers
--
-- Dennis's "number one" (15 Sep, 02:07–02:24; owner go-ahead 2026-09-28):
--
--   * A sales order moves to `ready` by itself when its last MO completes,
--     and Dennis gets a notice (`so.ready`) — some customers collect, so the
--     decision who drives is his.
--   * The DELIVERY CONTACT is known only after acceptance and is often a
--     department person who is not a `contacts` row, so it is free text on the
--     order: name, phone, address.
--   * The customer SIGNS with a finger on Finn's phone. The signature image
--     lives in a PRIVATE bucket (a customer's signature is not a public
--     picture), the signer's name and time on the order, and signing delivers
--     the order through the normal transition (bikes → assigned, sold parts
--     leave stock).

alter table public.sales_orders
  add column if not exists delivery_contact_name text,
  add column if not exists delivery_contact_phone text,
  add column if not exists delivery_address text,
  add column if not exists delivery_signed_by text,
  add column if not exists delivery_signed_at timestamptz,
  add column if not exists delivery_signature_path text;

comment on column public.sales_orders.delivery_contact_name is
  'Who receives the delivery — known after acceptance, often not a contacts row.';
comment on column public.sales_orders.delivery_signature_path is
  'Object path of the recipient''s finger signature in the private "signatures" bucket.';

insert into storage.buckets (id, name, public)
  values ('signatures', 'signatures', false)
  on conflict (id) do nothing;

-- Dennis is the Owner role; he decides who delivers.
insert into public.role_notifications (role_id, event_key)
select r.id, 'so.ready' from public.roles r where r.key = 'owner'
on conflict do nothing;

insert into public.schema_migrations (version, name)
  values (107, '107_delivery_process') on conflict (version) do nothing;

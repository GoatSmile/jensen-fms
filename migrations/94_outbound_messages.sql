-- 94 · Every outgoing message, kept
--
-- Until now an outbound email left almost no trace. `purchase_orders` and
-- `service_orders` each carry `emailed_at` + `emailed_to` — a timestamp and a
-- recipient string — and `notification_log` (migration 74) held event key,
-- recipient and test-mode for role notifications. Nobody stored the SUBJECT,
-- the BODY, or the fact that a send was REJECTED. So "what exactly did the
-- painter get, and when" was answerable only by re-rendering the document from
-- live data, and the free-text message typed into the send dialog was kept
-- nowhere at all.
--
-- One row per ATTEMPT, written before the provider is called (status
-- 'pending') and stamped after (status 'sent' with the provider's id, or
-- 'failed' with its complaint). A crash between the two leaves a 'pending'
-- row, which is the honest record of an attempt whose outcome we never saw.
--
-- `body_html` holds the exact bytes handed to the provider. That is the point
-- of the table: the documents are re-rendered from live data, so a price
-- change, a supplier language change or an edited message would otherwise
-- rewrite history.
--
-- Shape: the two DOCUMENT kinds get real FKs, because each has exactly one
-- parent and deletion should not orphan the record. NOTIFICATIONS keep the
-- loose (event_key, entity_id) pair they had in notification_log — the events
-- are keyed over many entity types (an invoice today) and the overdue-invoice
-- cron uses exactly that pair for idempotency. This table supersedes
-- notification_log; its rows are copied below and nothing writes to it after
-- this migration. The old table is LEFT IN PLACE rather than dropped, so the
-- change is reversible.
create table if not exists outbound_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  channel text not null default 'email'
    check (channel in ('email')),
  kind text not null
    check (kind in ('purchase_order', 'service_order', 'notification')),

  -- Document sends: one parent each.
  purchase_order_id uuid references purchase_orders(id) on delete cascade,
  service_order_id uuid references service_orders(id) on delete cascade,

  -- Notifications: who it went to, which event, and what it was about.
  person_id uuid references people(id) on delete set null,
  event_key text,
  entity_id uuid,

  -- Who pressed the button. Null for cron and other unattended sends.
  actor_person_id uuid references people(id) on delete set null,

  from_email text not null,
  to_emails text[] not null,
  -- Who it WOULD have gone to while outbound test mode reroutes the send.
  intended_to text[] not null default '{}',
  reply_to text,
  subject text not null,
  body_html text not null,
  test_mode boolean not null default false,

  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  provider text not null default 'resend',
  provider_id text,
  error_detail text,
  completed_at timestamptz,

  -- A document send names its order; a notification names its event.
  constraint outbound_messages_kind_shape check (
    case kind
      when 'purchase_order' then purchase_order_id is not null
      when 'service_order' then service_order_id is not null
      when 'notification' then event_key is not null
    end
  )
);

comment on table outbound_messages is
  'Every outgoing message, one row per attempt, with the exact body sent. Supersedes notification_log. Written only through sendAndRecord() in src/lib/email/outbox.ts.';

-- Newest-first is the only way the outbox list is ever read.
create index if not exists outbound_messages_created_idx
  on outbound_messages (created_at desc);
-- The per-order panels.
create index if not exists outbound_messages_po_idx
  on outbound_messages (purchase_order_id, created_at desc)
  where purchase_order_id is not null;
create index if not exists outbound_messages_so_idx
  on outbound_messages (service_order_id, created_at desc)
  where service_order_id is not null;
-- Cron idempotency: "was this event ever sent for this entity?"
create index if not exists outbound_messages_event_entity_idx
  on outbound_messages (event_key, entity_id)
  where event_key is not null;

-- RLS is on across every table (migration 50) with a permissive policy until
-- auth/M1 replaces it. Same treatment here so the app can read and write.
alter table outbound_messages enable row level security;

drop policy if exists anon_all on outbound_messages;
create policy anon_all on outbound_messages
  for all using (true) with check (true);

-- Carry the old log across. Those rows have no subject or body — they record a
-- send whose content was never kept — so they are marked as such rather than
-- pretending to hold a document.
insert into outbound_messages (
  created_at, channel, kind, person_id, event_key, entity_id,
  from_email, to_emails, subject, body_html, test_mode, status, provider,
  completed_at
)
select
  n.sent_at, n.channel, 'notification', n.person_id, n.event_key, n.entity_id,
  '(not recorded)', case when n.recipient is null then '{}'::text[] else array[n.recipient] end,
  '(not recorded)', '(body not recorded — sent before migration 94)',
  n.test_mode, 'sent', 'resend',
  n.sent_at
from notification_log n
where not exists (
  select 1 from outbound_messages o
  where o.kind = 'notification'
    and o.event_key = n.event_key
    and o.entity_id is not distinct from n.entity_id
    and o.person_id is not distinct from n.person_id
    and o.created_at = n.sent_at
);

comment on table notification_log is
  'SUPERSEDED by outbound_messages (migration 94). Rows were copied across; nothing writes here any more. Kept so the change is reversible.';

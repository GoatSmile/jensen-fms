-- 98 — The offer becomes a document: it can be emailed, and it can be revised
--
-- `offers` / `offer_lines` have existed since migration 01 with zero rows and
-- no app code. Building /offers needs exactly two things the schema does not
-- already carry:
--
-- 1. THE OFFER CAN BE EMAILED. `sendAndRecord` is the only way mail leaves this
--    app (migration 94), and its `kind` check plus the kind-shape constraint
--    know only purchase orders, service orders and notifications — so an offer
--    email is not merely unrecorded, it is refused by the database.
--
-- 2. THE OFFER CAN BE REVISED. A sent offer is frozen. When the customer comes
--    back with a counteroffer, the offer reopens for revision rather than being
--    edited underneath the document he is holding, so print and email can say
--    "rev. 2" and two documents bearing OFF-2026-0001 can be told apart.
--
--    A COUNTER, not revision rows. The exact body of every send is already kept
--    in `outbound_messages.body_html`, so "what did we quote him first?" is
--    answered without duplicating `offer_lines` per negotiation round — which is
--    the `service_price_lists` pattern and far too heavy for something that
--    turns two or three times. The counter upgrades to rows later if structured
--    version history is ever wanted; the reverse does not.

begin;

-- 1) Outbound: an offer is a fourth thing we can send.
alter table public.outbound_messages
  add column if not exists offer_id uuid
    references public.offers(id) on delete cascade;

alter table public.outbound_messages
  drop constraint if exists outbound_messages_kind_check;
alter table public.outbound_messages
  add constraint outbound_messages_kind_check
    check (kind in ('purchase_order', 'service_order', 'notification', 'offer'));

-- Same shape as before, plus the offer branch: the row must carry the id of
-- the thing it is about.
alter table public.outbound_messages
  drop constraint if exists outbound_messages_kind_shape;
alter table public.outbound_messages
  add constraint outbound_messages_kind_shape check (
    case kind
      when 'purchase_order' then purchase_order_id is not null
      when 'service_order'  then service_order_id is not null
      when 'offer'          then offer_id is not null
      when 'notification'   then event_key is not null
    end
  );

create index if not exists idx_outbound_messages_offer
  on public.outbound_messages (offer_id, created_at desc)
  where offer_id is not null;

-- 2) Offers: which revision of this document is current.
alter table public.offers
  add column if not exists revision integer not null default 1;

alter table public.offers
  drop constraint if exists offers_revision_positive;
alter table public.offers
  add constraint offers_revision_positive check (revision >= 1);

comment on column public.offers.revision is
  'Which revision of this offer number is current, from 1. Incremented when a '
  'sent/accepted/rejected offer is reopened for revision after a counteroffer; '
  'the offer_number never changes. Printed and emailed as "rev. N" so two '
  'documents bearing the same OFF- number can be told apart. Past revisions '
  'are not rows: the exact body of every send is kept in outbound_messages.';

commit;

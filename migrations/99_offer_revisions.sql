-- 99 — What the offer SAID when it was sent, kept
--
-- CORRECTS A CLAIM MADE IN MIGRATION 98's HEADER, which said the exact body of
-- every send already lives in `outbound_messages.body_html` and that a revision
-- counter was therefore enough. That is true only of the EMAILED path. Marking
-- an offer sent after printing it stores nothing at all — `markOfferSent` stamps
-- dates and flips a status, and the print page renders live from current data —
-- so an offer printed, handed to a customer, and then reopened for revision
-- loses what revision 1 said. On a workshop floor the printed path is the likely
-- one. (98 is already applied and is not edited; this file is the correction.)
--
-- So: one row per revision, written at the moment of sending, holding the whole
-- rendered document model. Not a live-maintained parallel edit surface — the
-- thing I rejected in 98 was heavier than what was actually needed. It is
-- written once, by the one function both send doors already go through.
--
-- The document is stored WHOLE, labels included, so a later change to wording
-- or to a price cannot rewrite what the customer was handed. Same reasoning as
-- keeping body_html rather than re-rendering.

begin;

create table if not exists public.offer_revisions (
  id           uuid primary key default gen_random_uuid(),
  offer_id     uuid not null references public.offers(id) on delete cascade,
  revision     integer not null check (revision >= 1),
  -- Copied out of the offer at send so the row is readable without a join,
  -- and so it still reads correctly after a later revision restamps them.
  issued_date  date not null,
  expiry_date  date,
  sent_at      timestamptz not null default now(),
  sent_by      uuid references public.people(id) on delete set null,
  -- The full OfferDocument as rendered: customer, lines, totals, labels.
  document     jsonb not null,
  -- markOfferSent only runs on a draft, so a revision is sent exactly once.
  -- Re-emailing an already-sent offer re-sends this same document and is
  -- recorded in outbound_messages, not here.
  unique (offer_id, revision)
);

create index if not exists idx_offer_revisions_offer
  on public.offer_revisions (offer_id, revision desc);

comment on table public.offer_revisions is
  'One row per revision of an offer, written at send by markOfferSent, holding '
  'the whole rendered document. This is what the customer was actually given; '
  'the offer row itself goes on changing.';

-- Which revision the customer said yes to. Nothing recorded this before, so
-- "he accepted" was ambiguous the moment a counteroffer bumped the revision.
alter table public.offers
  add column if not exists accepted_revision integer;

comment on column public.offers.accepted_revision is
  'The revision the customer accepted, stamped when status becomes accepted. '
  'Null for offers accepted before this column existed, and for offers that '
  'were never accepted.';

commit;

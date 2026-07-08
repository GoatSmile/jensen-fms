-- Migration 55: Communication settings on the app_settings singleton.
--
-- Owner-configurable sender identity + phone number for every outbound
-- channel the app grows: the Tier-3 "email a PO to the supplier" flow first,
-- the phone-call → ticket pipeline (SMS acks, call routing) later. Lives in
-- admin → Settings, not env vars — Dennis owns these values.
--
-- Test mode ships ON with the owner/dev inboxes as the test recipients:
-- while on, ALL outbound mail is rerouted to outbound_test_email instead of
-- the real recipient, so the send flow can be exercised end-to-end without
-- mailing a supplier by accident. Flipping it off is the go-live switch.

alter table public.app_settings
  add column if not exists outbound_from_email text,
  add column if not exists outbound_reply_to_email text,
  add column if not exists outbound_test_mode boolean not null default true,
  add column if not exists outbound_test_email text,
  add column if not exists workshop_phone text;

comment on column public.app_settings.outbound_from_email is
  'Sender address for app-generated email (PO to supplier, later ticket-pipeline mail). Must be on a domain the email provider has verified.';
comment on column public.app_settings.outbound_reply_to_email is
  'Reply-to for app-generated email — typically the owner''s real inbox.';
comment on column public.app_settings.outbound_test_mode is
  'While TRUE, all outbound email is rerouted to outbound_test_email instead of the real recipients. Ships ON; flipping it off is the go-live switch.';
comment on column public.app_settings.outbound_test_email is
  'Recipient(s) for rerouted mail while test mode is on. Comma-separated for several inboxes.';
comment on column public.app_settings.workshop_phone is
  'The shop''s phone number — surfaced on outbound documents and reserved for the phone-call → ticket pipeline (call routing, SMS sender identity).';

-- Seed the test setup: from/reply-to per the locked Resend decision
-- (deej@jensenproduction.dk), test recipients = the owner + dev inboxes.
-- All editable at /admin/settings; coalesce keeps a re-run harmless.
update public.app_settings set
  outbound_from_email     = coalesce(outbound_from_email, 'deej@jensenproduction.dk'),
  outbound_reply_to_email = coalesce(outbound_reply_to_email, 'deej@jensenproduction.dk'),
  outbound_test_email     = coalesce(outbound_test_email, 'nicholas.nazar@gmail.com, deej@jensenproduction.dk')
where id = 1;

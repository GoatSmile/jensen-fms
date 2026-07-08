-- Migration 56: Email sending domain + DNS verification records (reference).
--
-- Companion to migration 55's communication settings. The DNS records
-- themselves live at the domain's DNS host — verification happens against
-- the public zone, not against anything in this app. What the app stores is
-- the REFERENCE COPY: which records the email provider (Resend) requires,
-- their exact values to paste at the DNS host, and their verification
-- status, so the owner isn't digging through the provider dashboard or an
-- email thread to find them. Once the Resend API key lands (env var — it's
-- a secret, unlike these records, which are public in DNS anyway), the card
-- can fetch records + live status instead of manual upkeep.
--
-- email_dns_records shape: JSONB array of
--   { "type": "TXT" | "CNAME" | "MX", "name": "...", "value": "...",
--     "status": "pending" | "verified", "note": "..." }

alter table public.app_settings
  add column if not exists email_domain text,
  add column if not exists email_dns_records jsonb not null default '[]'::jsonb;

comment on column public.app_settings.email_domain is
  'Domain outbound email sends from (e.g. jensenproduction.dk). The from-address must be on it once the provider has verified the domain.';
comment on column public.app_settings.email_dns_records is
  'Reference copy of the DNS records the email provider requires (type/name/value/status/note). The authoritative records live at the DNS host; this is the paste-source and status tracker.';

update public.app_settings set
  email_domain = coalesce(email_domain, 'jensenproduction.dk')
where id = 1;

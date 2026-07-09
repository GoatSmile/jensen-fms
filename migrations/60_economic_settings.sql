-- 60: e-conomic integration groundwork (3E, started 2026-07-09).
--
-- Design (verified against the live REST API, restapi.e-conomic.com):
-- issued invoices are pushed as DRAFT JOURNAL VOUCHERS using the
-- manualCustomerInvoice entry type — debit customer, contra revenue
-- account + VAT code — NOT as e-conomic invoices (the FMS owns the
-- invoice number series; e-conomic issuing its own numbers would fork
-- the series). The bookkeeper reviews and books the voucher in
-- e-conomic (kassekladden), which keeps the revisor in the loop.
-- One entry per distinct VAT rate on the invoice; 0%-rated entries
-- (export / reverse charge) carry no VAT code. Credit notes push as
-- negative entries.
--
-- Config-vs-secrets rule (owner, 2026-07-08): the API tokens are
-- secrets → env vars (ECONOMIC_APP_SECRET_TOKEN +
-- ECONOMIC_AGREEMENT_GRANT_TOKEN); everything below is operational
-- config → app_settings, edited at /admin/settings. Chart-of-accounts
-- numbers (journal, revenue account) are the owner's/revisor's call —
-- left NULL until filled, and the push action refuses with a clear
-- message while they are.

alter table public.app_settings
  add column if not exists economic_enabled boolean not null default false,
  add column if not exists economic_journal_number integer,
  add column if not exists economic_revenue_account integer,
  add column if not exists economic_vat_code text,
  add column if not exists economic_customer_group integer,
  add column if not exists economic_vat_zone integer,
  add column if not exists economic_payment_terms integer;

comment on column public.app_settings.economic_journal_number is
  'e-conomic journal (kassekladde) that receives invoice vouchers.';
comment on column public.app_settings.economic_revenue_account is
  'Contra account for invoice revenue (chart-of-accounts number).';
comment on column public.app_settings.economic_vat_code is
  'Outgoing VAT code applied to VAT-carrying entries (DK standard: U25). Zero-rated lines push without a VAT code.';

-- Standard Danish defaults for the customer-create vocabularies; the
-- owner can adjust at /admin/settings once connected.
update public.app_settings
set economic_vat_code = coalesce(economic_vat_code, 'U25'),
    economic_customer_group = coalesce(economic_customer_group, 1),
    economic_vat_zone = coalesce(economic_vat_zone, 1)
where id = 1;

-- FMS org ↔ e-conomic customer mapping, written on first push (the
-- customer is auto-created; e-conomic assigns the number when omitted).
alter table public.organizations
  add column if not exists economic_customer_number integer;

create unique index if not exists organizations_economic_customer_number_key
  on public.organizations (economic_customer_number)
  where economic_customer_number is not null;

comment on column public.organizations.economic_customer_number is
  'e-conomic customer number; assigned by e-conomic on first invoice push.';

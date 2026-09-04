-- 101 — production says which migrations it has
--
-- WHY THIS EXISTS. On 2026-09-04 `/offers` threw a 500 in production for every
-- visitor from the moment it shipped, because migrations 98 and 99 had never
-- been applied. Nothing caught it, and nothing could have:
--
--   * schema is applied BY HAND while code deploys itself on push-to-main, so
--     the two halves can diverge silently;
--   * NOTHING anywhere recorded which migrations had run, in either database,
--     so "is production up to date?" was answerable only by probing objects one
--     at a time — which is why the previous session wrote "owner-reported and
--     then pushed; not independently verified";
--   * `tsc` cannot see it, because `src/lib/types/database.ts` is hand-patched
--     to describe the INTENDED schema;
--   * `npm run smoke` hits the dev server, which points at the LOCAL copy,
--     where 98 and 99 were applied — it passed 93 routes against the wrong
--     database;
--   * and the one check that was performed, "/offers answers 307 -> /login",
--     redirects in middleware BEFORE the page runs a query, so it can never see
--     a schema error. It gave false assurance.
--
-- This table is the missing instrument. `scripts/check-prod-schema.mjs` diffs
-- `migrations/*.sql` against it and names exactly what is missing; a PreToolUse
-- hook runs that on `git push`, which is the moment the divergence ships.
--
-- THE LEDGER IS ONLY AS HONEST AS THE INSERTS. Every migration from here on
-- ends with its own insert, so the ledger maintains itself. A forgotten line
-- fails SAFE — the checker reports a migration missing when it is actually
-- applied, which is noisy but never dangerous. The reverse (claiming applied
-- when it is not) is the failure this file exists to prevent, and it cannot
-- happen: only the migration's own body can write its row.
--
-- The backfill below asserts 1..100 are on production. That is true as of
-- 2026-09-04: 98, 99 and 100 were applied and verified object-by-object that
-- day, and everything below them was already serving the live app.

begin;

create table if not exists public.schema_migrations (
  version    integer primary key,
  name       text        not null,
  applied_at timestamptz not null default now()
);

comment on table public.schema_migrations is
  'One row per applied migration, written by the migration itself. Read by '
  'scripts/check-prod-schema.mjs, which diffs it against migrations/*.sql. '
  'Never hand-write a row: a row here is a claim that the DDL ran.';

-- RLS is on across every table (migration 50) with a permissive policy until
-- auth/M1 replaces it. Same treatment here — including the one its immediate
-- predecessor forgot (migration 100).
alter table public.schema_migrations enable row level security;

drop policy if exists anon_all on public.schema_migrations;
create policy anon_all on public.schema_migrations
  for all using (true) with check (true);

insert into public.schema_migrations (version, name) values
  (1, '01_schema'),
  (2, '02_seed_reference_data'),
  (3, '03_migrate_excel_data'),
  (4, '04_v_part_last_cost'),
  (5, '05_part_images_bucket'),
  (6, '06_v_parts_dashboard'),
  (7, '07_reorder_points'),
  (8, '08_bike_model_frame_code'),
  (9, '09_template_refactor'),
  (10, '10_paint_orders'),
  (11, '11_bike_images_bucket'),
  (12, '12_public_report_attempts'),
  (13, '13_hs_codes_and_landed_cost_refactor'),
  (14, '14_reimport_spreadsheet'),
  (15, '15_clear_stale_supplier_prices'),
  (16, '16_reconcile_categories_to_dennis_canon'),
  (17, '17_fx_rates_unique_index'),
  (18, '18_currencies_sort_order'),
  (19, '19_unidentified_bike_reports'),
  (20, '20_report_tracking'),
  (21, '21_org_geocoding'),
  (22, '22_part_tariff_override'),
  (23, '23_anti_dumping'),
  (24, '24_backfill_historical_landed_cost'),
  (25, '25_supplier_country_codes'),
  (26, '26_customer_import_schema'),
  (27, '27_import_customers'),
  (28, '28_customer_country_codes'),
  (29, '29_org_lifecycle_stage'),
  (30, '30_service_agreement_unit'),
  (31, '31_v_po_totals'),
  (32, '32_backfill_po_order_totals'),
  (33, '33_kits'),
  (34, '34_kit_number_optional'),
  (35, '35_retail_backfill_and_last_cost_fix'),
  (36, '36_v_parts_dashboard_retail'),
  (37, '37_invoice_agreement_and_credit_links'),
  (38, '38_po_unit_price_nullable'),
  (39, '39_colors_coating'),
  (40, '40_so_delivery_precision'),
  (41, '41_mo_completion_precision'),
  (42, '42_coatings_vocab'),
  (43, '43_bikes_built_at'),
  (44, '44_bikes_frame_confirmed'),
  (45, '45_paint_orders_sales_link'),
  (46, '46_sales_orders_production_note'),
  (47, '47_app_settings_location'),
  (48, '48_invoice_kind_and_deposit'),
  (49, '49_app_language_settings'),
  (50, '50_enable_rls'),
  (51, '51_paint_line_color_scope'),
  (52, '52_bike_families'),
  (53, '53_drop_bike_template_family'),
  (54, '54_part_origin_and_supplier_duty'),
  (55, '55_communication_settings'),
  (56, '56_email_domain_dns'),
  (57, '57_po_emailed_stamp'),
  (58, '58_dashboard_monthly_stats'),
  (59, '59_legacy_monthly_stats'),
  (60, '60_economic_settings'),
  (61, '61_service_model'),
  (62, '62_service_seed_paint'),
  (63, '63_bike_template_service_parts'),
  (64, '64_service_price_list_publish'),
  (65, '65_inbound_messages'),
  (66, '66_inbound_provider_settings'),
  (67, '67_service_type_default_supplier'),
  (68, '68_inbound_test_number'),
  (69, '69_inbound_call_events'),
  (70, '70_inbound_transcript_confidence'),
  (71, '71_inbound_triage'),
  (72, '72_inbound_disposition_handled'),
  (73, '73_people_roles'),
  (74, '74_notification_log'),
  (75, '75_inbound_in_app_channel'),
  (76, '76_voice_commands'),
  (77, '77_inbound_phone_call_channel'),
  (78, '78_inbound_call_bridging'),
  (79, '79_drop_person_engagement'),
  (80, '80_person_passwords'),
  (81, '81_person_preferences'),
  (82, '82_replace_service_order_items'),
  (83, '83_work_attribution'),
  (84, '84_bike_state_actor'),
  (85, '85_invoice_actor'),
  (86, '86_bike_state_log_actor_fk'),
  (87, '87_audit_trail'),
  (88, '88_unit_cost_basis'),
  (89, '89_painter_document'),
  (90, '90_document_language_comment'),
  (91, '91_painted_parts'),
  (92, '92_seed_lines_carry_part'),
  (93, '93_supplier_email_message'),
  (94, '94_outbound_messages'),
  (95, '95_outbound_entity_ids'),
  (96, '96_outbound_migrated_recipients'),
  (97, '97_painter_type_category_default'),
  (98, '98_offer_document'),
  (99, '99_offer_revisions'),
  (100, '100_offer_revisions_rls'),
  (101, '101_schema_ledger')
on conflict (version) do nothing;

commit;

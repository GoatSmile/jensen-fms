-- Migration 50: Enable RLS on all public tables
--
-- Applied 2026-06-24 via Supabase MCP.
--
-- Context: Supabase flagged all 55 tables as publicly accessible (rowsecurity=false).
-- The app runs every query through the anon key today (no auth wired yet), so
-- simply enabling RLS without policies would break everything. The fix is to
-- enable RLS + add a permissive anon policy that preserves current behaviour.
-- The service role (service.ts / SUPABASE_SECRET_KEY) bypasses RLS automatically
-- and needs no policy.
--
-- When auth is wired (M1), replace these permissive policies with user-scoped ones
-- (e.g. FOR ALL TO authenticated USING (true) or row-filtered variants).

-- Enable RLS
ALTER TABLE public.app_settings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bike_identifier_types         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bike_identifiers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bike_parts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bike_state_log                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bike_template_parts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bike_templates                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bike_type_required_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bike_types                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bikes                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coatings                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colors                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_groups               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_segments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sequences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frame_lookup_attempts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rates                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_codes                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kits                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tickets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturing_order_parts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturing_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_lines                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_tax_identifiers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_units            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paint_order_bikes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paint_orders                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_categories               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_kits                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_retail_prices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_supplier_offerings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_report_attempts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_page_views             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_lines             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_agreements            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_identifier_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_codes                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_parts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders                   ENABLE ROW LEVEL SECURITY;

-- Permissive anon policies (maintains current behaviour until auth is wired)
CREATE POLICY "anon_all" ON public.app_settings                  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.attachments                   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.audit_log                     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.bike_identifier_types         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.bike_identifiers              FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.bike_parts                    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.bike_state_log                FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.bike_template_parts           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.bike_templates                FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.bike_type_required_identifiers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.bike_types                    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.bikes                         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.coatings                      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.colors                        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.contacts                      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.currencies                    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.customer_groups               FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.customer_segments             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.document_sequences            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.frame_lookup_attempts         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.fx_rates                      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.hs_codes                      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.inventory_locations           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.inventory_movements           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.invoice_lines                 FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.invoices                      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.kits                          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.maintenance_tickets           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.manufacturing_order_parts     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.manufacturing_orders          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.offer_lines                   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.offers                        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.organization_tax_identifiers  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.organization_units            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.organizations                 FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.paint_order_bikes             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.paint_orders                  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.part_categories               FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.part_kits                     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.part_retail_prices            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.part_supplier_offerings       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.parts                         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.public_report_attempts        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.purchase_order_lines          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.purchase_orders               FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.report_page_views             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.sales_order_lines             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.sales_orders                  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.service_agreements            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.shipments                     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.suppliers                     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.tax_identifier_types          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.vat_codes                     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.work_order_parts              FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.work_orders                   FOR ALL TO anon USING (true) WITH CHECK (true);

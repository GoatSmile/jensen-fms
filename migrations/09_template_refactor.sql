-- 09_template_refactor.sql
--
-- Collapse the bike_models / bike_model_variants / bike_templates trio
-- down to bike_templates as the single product entity. Color moves out of
-- variants and becomes a controlled vocabulary picked at order/build time.
--
-- Prereq: no domain data in bikes / bike_models / bike_model_variants /
-- bike_templates / manufacturing_orders / offer_lines / sales_order_lines /
-- invoice_lines (wiped in the prior import session).
--
-- Decisions baked in (see CLAUDE.md history):
--   * Templates carry frame_size and an optional family label for grouping
--   * Color is its own controlled-vocab table; FK from bikes, MOs, doc lines
--   * Template versioning (version + is_current) is kept
--   * Paint workflow gets its own table (added in 10_paint_orders.sql)
--   * One-off builds: MOs may have a NULL bike_template_id

BEGIN;

-- 1) Drop the three localized line views; they reference the doomed columns
DROP VIEW IF EXISTS public.v_invoice_lines_localized;
DROP VIEW IF EXISTS public.v_offer_lines_localized;
DROP VIEW IF EXISTS public.v_sales_order_lines_localized;

-- 2) Replace effective_line_description() — drop the variant branch
DROP FUNCTION IF EXISTS public.effective_line_description(character, text, text, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.effective_line_description(
    p_lang        character,
    p_override_en text,
    p_override_da text,
    p_part_id     uuid,
    p_template_id uuid
) RETURNS text
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_result TEXT;
BEGIN
    -- 1. Override in the document's language wins
    IF p_lang = 'da' THEN
        IF p_override_da IS NOT NULL AND p_override_da <> '' THEN
            RETURN p_override_da;
        END IF;
        IF p_override_en IS NOT NULL AND p_override_en <> '' THEN
            RETURN p_override_en;
        END IF;
    ELSE
        IF p_override_en IS NOT NULL AND p_override_en <> '' THEN
            RETURN p_override_en;
        END IF;
        IF p_override_da IS NOT NULL AND p_override_da <> '' THEN
            RETURN p_override_da;
        END IF;
    END IF;

    -- 2. Part lookup
    IF p_part_id IS NOT NULL THEN
        IF p_lang = 'da' THEN
            SELECT COALESCE(NULLIF(name_da, ''), name_en) INTO v_result
            FROM parts WHERE id = p_part_id;
        ELSE
            SELECT COALESCE(NULLIF(name_en, ''), name_da) INTO v_result
            FROM parts WHERE id = p_part_id;
        END IF;
        IF v_result IS NOT NULL THEN RETURN v_result; END IF;
    END IF;

    -- 3. Template lookup
    IF p_template_id IS NOT NULL THEN
        IF p_lang = 'da' THEN
            SELECT COALESCE(NULLIF(name_da, ''), name_en) INTO v_result
            FROM bike_templates WHERE id = p_template_id;
        ELSE
            SELECT COALESCE(NULLIF(name_en, ''), name_da) INTO v_result
            FROM bike_templates WHERE id = p_template_id;
        END IF;
        IF v_result IS NOT NULL THEN RETURN v_result; END IF;
    END IF;

    RETURN CASE WHEN p_lang = 'da' THEN '(Uden beskrivelse)' ELSE '(No description)' END;
END;
$function$;

-- 3) Drop the variant/model FK columns from every dependent table
ALTER TABLE public.bike_templates       DROP COLUMN IF EXISTS bike_model_id;
ALTER TABLE public.bike_templates       DROP COLUMN IF EXISTS bike_model_variant_id;

ALTER TABLE public.bikes                DROP COLUMN IF EXISTS bike_model_id;
ALTER TABLE public.bikes                DROP COLUMN IF EXISTS bike_model_variant_id;

ALTER TABLE public.manufacturing_orders DROP COLUMN IF EXISTS bike_model_id;
ALTER TABLE public.manufacturing_orders DROP COLUMN IF EXISTS bike_model_variant_id;

ALTER TABLE public.offer_lines          DROP COLUMN IF EXISTS bike_model_variant_id;
ALTER TABLE public.sales_order_lines    DROP COLUMN IF EXISTS bike_model_variant_id;
ALTER TABLE public.invoice_lines        DROP COLUMN IF EXISTS bike_model_variant_id;

-- 4) Drop the now-dependency-free model + variant tables
DROP TABLE IF EXISTS public.bike_model_variants;
DROP TABLE IF EXISTS public.bike_models;

-- 5) Create the colors reference table
CREATE TABLE public.colors (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text NOT NULL UNIQUE,
    name_da     text NOT NULL,
    name_en     text NOT NULL,
    hex         text,           -- optional, for UI swatches
    ral_code    text,           -- optional, RAL classic if applicable
    sort_order  integer NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT NOW(),
    updated_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_colors_updated_at
    BEFORE UPDATE ON public.colors
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.colors (slug, name_da, name_en, hex, sort_order) VALUES
    ('white', 'Hvid', 'White', '#ffffff', 10),
    ('red',   'Rød',  'Red',   '#d83a3a', 20),
    ('black', 'Sort', 'Black', '#1a1a1a', 30);

-- 6) Promote bike_templates to the primary product entity
ALTER TABLE public.bike_templates
    ADD COLUMN frame_size                text NOT NULL DEFAULT '',
    ADD COLUMN family                    text,
    ADD COLUMN default_retail_price      numeric(15,4),
    ADD COLUMN default_retail_currency   character(3) REFERENCES public.currencies(code);

-- Drop the placeholder default so future inserts must supply a real size
ALTER TABLE public.bike_templates ALTER COLUMN frame_size DROP DEFAULT;

CREATE INDEX idx_bike_templates_family       ON public.bike_templates (family);
CREATE INDEX idx_bike_templates_bike_type_id ON public.bike_templates (bike_type_id);
CREATE INDEX idx_bike_templates_is_current   ON public.bike_templates (is_current) WHERE is_current = true;

-- 7) Bikes: gain color_id; template_id already nullable from before
ALTER TABLE public.bikes
    ADD COLUMN color_id uuid REFERENCES public.colors(id);

CREATE INDEX idx_bikes_color_id ON public.bikes (color_id);

-- 8) Manufacturing orders: gain color_id, template now nullable for one-offs
ALTER TABLE public.manufacturing_orders
    ALTER COLUMN bike_template_id DROP NOT NULL,
    ADD COLUMN color_id uuid REFERENCES public.colors(id);

CREATE INDEX idx_manufacturing_orders_color_id ON public.manufacturing_orders (color_id);

-- 9) Commercial document lines: gain color_id
ALTER TABLE public.offer_lines
    ADD COLUMN color_id uuid REFERENCES public.colors(id);
ALTER TABLE public.sales_order_lines
    ADD COLUMN color_id uuid REFERENCES public.colors(id);
ALTER TABLE public.invoice_lines
    ADD COLUMN color_id uuid REFERENCES public.colors(id);

CREATE INDEX idx_offer_lines_color_id        ON public.offer_lines (color_id);
CREATE INDEX idx_sales_order_lines_color_id  ON public.sales_order_lines (color_id);
CREATE INDEX idx_invoice_lines_color_id      ON public.invoice_lines (color_id);

-- 10) Recreate the three localized line views with the new function signature
CREATE OR REPLACE VIEW public.v_offer_lines_localized AS
    SELECT ol.id,
           ol.offer_id,
           ol.line_number,
           ol.part_id,
           ol.bike_template_id,
           ol.color_id,
           ol.description_en,
           ol.description_da,
           ol.quantity,
           ol.unit_price,
           ol.vat_code,
           ol.vat_rate,
           ol.line_subtotal,
           ol.line_vat_amount,
           ol.line_total,
           o.language AS document_language,
           public.effective_line_description(
               o.language, ol.description_en, ol.description_da,
               ol.part_id, ol.bike_template_id
           ) AS effective_description
      FROM offer_lines ol
      JOIN offers o ON o.id = ol.offer_id;

CREATE OR REPLACE VIEW public.v_sales_order_lines_localized AS
    SELECT sol.id,
           sol.sales_order_id,
           sol.line_number,
           sol.part_id,
           sol.bike_template_id,
           sol.color_id,
           sol.description_en,
           sol.description_da,
           sol.quantity,
           sol.unit_price,
           sol.vat_code,
           sol.vat_rate,
           sol.line_subtotal,
           sol.line_vat_amount,
           sol.line_total,
           so.language AS document_language,
           public.effective_line_description(
               so.language, sol.description_en, sol.description_da,
               sol.part_id, sol.bike_template_id
           ) AS effective_description
      FROM sales_order_lines sol
      JOIN sales_orders so ON so.id = sol.sales_order_id;

CREATE OR REPLACE VIEW public.v_invoice_lines_localized AS
    SELECT il.id,
           il.invoice_id,
           il.line_number,
           il.part_id,
           il.bike_template_id,
           il.color_id,
           il.description_en,
           il.description_da,
           il.quantity,
           il.unit_price,
           il.vat_code,
           il.vat_rate,
           il.line_subtotal,
           il.line_vat_amount,
           il.line_total,
           i.language AS document_language,
           public.effective_line_description(
               i.language, il.description_en, il.description_da,
               il.part_id, il.bike_template_id
           ) AS effective_description
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id;

COMMIT;

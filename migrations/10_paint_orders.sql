-- 10_paint_orders.sql
--
-- Paint orders are a first-class workflow: any bike can be sent for paint
-- (typically to Metacoat A/S) and tracked through the round trip. A paint
-- order is a *batch* — one supplier visit can cover N bikes. The cost
-- captured on the order reflects what the painter charges; the catalog
-- "Lakering" parts (JP-lak1 std, JP-lak10 std, JP-lak20 std, *.svaj) stay
-- as service SKUs so PO lines can reference them, but paint does NOT flow
-- through inventory_movements.
--
-- A bike may have multiple paint orders across its lifetime (rare, e.g.
-- repaint after damage), so the link is many-to-many.

BEGIN;

-- 1) Enum for the round-trip status
CREATE TYPE public.paint_order_status AS ENUM (
    'planned',          -- created, not yet sent
    'sent_to_painter',  -- shipped to supplier
    'at_painter',       -- supplier confirmed receipt / in progress
    'received_back',    -- returned to us
    'cancelled'
);

-- 2) Header
CREATE TABLE public.paint_orders (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    paint_order_number  text NOT NULL UNIQUE,            -- via next_document_number('paint_order')
    supplier_id         uuid NOT NULL REFERENCES public.suppliers(id),
    color_id            uuid NOT NULL REFERENCES public.colors(id),
    paint_part_id       uuid REFERENCES public.parts(id),  -- optional: the Lakering catalog SKU used for costing
    status              public.paint_order_status NOT NULL DEFAULT 'planned',
    planned_send_date   date,
    sent_at             timestamptz,
    expected_return_at  timestamptz,
    received_at         timestamptz,
    unit_cost           numeric(15,4),                   -- charged per bike by the painter
    unit_cost_currency  character(3) REFERENCES public.currencies(code),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT NOW(),
    updated_at          timestamptz NOT NULL DEFAULT NOW(),
    created_by          uuid
);

CREATE TRIGGER trg_paint_orders_updated_at
    BEFORE UPDATE ON public.paint_orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_paint_orders_supplier_id ON public.paint_orders (supplier_id);
CREATE INDEX idx_paint_orders_color_id    ON public.paint_orders (color_id);
CREATE INDEX idx_paint_orders_status      ON public.paint_orders (status);
CREATE INDEX idx_paint_orders_sent_at     ON public.paint_orders (sent_at);

-- 3) Bike batch (M:N)
CREATE TABLE public.paint_order_bikes (
    paint_order_id  uuid NOT NULL REFERENCES public.paint_orders(id) ON DELETE CASCADE,
    bike_id         uuid NOT NULL REFERENCES public.bikes(id) ON DELETE RESTRICT,
    added_at        timestamptz NOT NULL DEFAULT NOW(),
    notes           text,
    PRIMARY KEY (paint_order_id, bike_id)
);

CREATE INDEX idx_paint_order_bikes_bike_id ON public.paint_order_bikes (bike_id);

-- 4) Teach next_document_number() about the paint_order doc type
--    (rows are created lazily on first call; we only need the prefix mapping)
CREATE OR REPLACE FUNCTION public.next_document_number(p_doc_type text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_year      INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
    v_seq       RECORD;
    v_prefix    TEXT;
    v_pad       INTEGER;
BEGIN
    UPDATE document_sequences
    SET current_value = current_value + 1
    WHERE document_type = p_doc_type AND year = v_year
    RETURNING * INTO v_seq;

    IF NOT FOUND THEN
        v_prefix := CASE p_doc_type
            WHEN 'invoice' THEN 'INV'
            WHEN 'sales_order' THEN 'SO'
            WHEN 'offer' THEN 'OFF'
            WHEN 'purchase_order' THEN 'PO'
            WHEN 'manufacturing_order' THEN 'MO'
            WHEN 'work_order' THEN 'WO'
            WHEN 'maintenance_ticket' THEN 'TKT'
            WHEN 'shipment' THEN 'SHP'
            WHEN 'paint_order' THEN 'PNT'
            ELSE UPPER(SUBSTRING(p_doc_type FROM 1 FOR 3))
        END;
        v_pad := 4;

        INSERT INTO document_sequences (document_type, year, current_value, prefix, pad_width)
        VALUES (p_doc_type, v_year, 1, v_prefix, v_pad)
        RETURNING * INTO v_seq;
    END IF;

    RETURN v_seq.prefix || '-' || v_seq.year || '-' ||
           LPAD(v_seq.current_value::TEXT, v_seq.pad_width, '0');
END;
$function$;

COMMIT;

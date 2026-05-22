-- ============================================================================
-- 13 — HS/TARIC codes + app settings + landed-cost refactor
-- ============================================================================
-- Per Dennis: landed cost is the *additive* sum of base, transport, and
-- EU import tax (a percentage tied to the part's TARIC classification).
-- We restructure the per-line storage so the breakdown is honest:
--
--   base_dkk        = unit_price × fx_rate_to_dkk
--   transport_dkk   = base_dkk × transport_pct       (default 10 %, settable)
--   import_tax_dkk  = base_dkk × tariff_pct          (from part's HS code,
--                                                     snapshotted at insert)
--   landed_dkk      = base_dkk × (1 + transport_pct + tariff_pct)
--
-- Existing transport_factor was a multiplier (1.10 = 10 %). We migrate it to
-- transport_pct (0.10), drop the multiplier, and add tariff_pct alongside.
-- The GENERATED landed_cost_dkk_per_unit column is dropped and recreated
-- with the new formula. v_part_last_cost and v_parts_dashboard recompute
-- to match.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HS / TARIC codes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hs_codes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code         TEXT NOT NULL UNIQUE,
    description  TEXT NOT NULL,
    tariff_pct   NUMERIC(6,4) NOT NULL CHECK (tariff_pct >= 0 AND tariff_pct <= 1),
    notes        TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hs_codes_active ON hs_codes (is_active);

COMMENT ON TABLE  hs_codes IS
  'Harmonized System / EU TARIC classification codes. Each part may reference one; PO lines snapshot the tariff_pct at insert so the cost basis stays frozen.';
COMMENT ON COLUMN hs_codes.tariff_pct IS
  'EU import duty as a decimal (0.10 = 10 %). Applied on top of base × transport when the part is imported.';

-- ----------------------------------------------------------------------------
-- 2. Singleton app_settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
    id                       SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    default_transport_pct    NUMERIC(6,4) NOT NULL DEFAULT 0.10
                             CHECK (default_transport_pct >= 0 AND default_transport_pct <= 1),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (id, default_transport_pct)
VALUES (1, 0.10)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE  app_settings IS
  'Singleton row (id = 1) holding app-wide defaults. Today: default transport % used for new PO lines.';
COMMENT ON COLUMN app_settings.default_transport_pct IS
  'Default transport markup for new PO lines (0.10 = 10 %). Editable in the admin UI.';

-- ----------------------------------------------------------------------------
-- 3. parts.hs_code_id
-- ----------------------------------------------------------------------------
ALTER TABLE parts
  ADD COLUMN IF NOT EXISTS hs_code_id UUID REFERENCES hs_codes(id);

CREATE INDEX IF NOT EXISTS idx_parts_hs_code ON parts (hs_code_id);

COMMENT ON COLUMN parts.hs_code_id IS
  'TARIC classification. Optional — when null, PO line snapshots tariff_pct = 0.';

-- ----------------------------------------------------------------------------
-- 4. Drop views that depend on landed_cost / transport_factor
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_parts_dashboard;
DROP VIEW IF EXISTS v_part_last_cost;

-- ----------------------------------------------------------------------------
-- 5. Refactor purchase_order_lines columns
-- ----------------------------------------------------------------------------
-- Drop the GENERATED column first (depends on transport_factor).
ALTER TABLE purchase_order_lines
  DROP COLUMN IF EXISTS landed_cost_dkk_per_unit;

-- Add new percentage columns.
ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS transport_pct NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS tariff_pct    NUMERIC(6,4) NOT NULL DEFAULT 0;

-- Backfill transport_pct from the old multiplier (1.10 → 0.10).
UPDATE purchase_order_lines
SET transport_pct = GREATEST(transport_factor - 1, 0)
WHERE transport_pct IS NULL;

-- Tighten constraints now that data is populated.
ALTER TABLE purchase_order_lines
  ALTER COLUMN transport_pct SET NOT NULL,
  ALTER COLUMN transport_pct SET DEFAULT 0.10,
  ADD CONSTRAINT po_lines_transport_pct_chk CHECK (transport_pct >= 0 AND transport_pct <= 1),
  ADD CONSTRAINT po_lines_tariff_pct_chk    CHECK (tariff_pct    >= 0 AND tariff_pct    <= 1);

-- Drop the old multiplier column.
ALTER TABLE purchase_order_lines
  DROP COLUMN IF EXISTS transport_factor;

-- Recreate the landed_cost generated column with the new additive formula.
ALTER TABLE purchase_order_lines
  ADD COLUMN landed_cost_dkk_per_unit NUMERIC(15,4)
    GENERATED ALWAYS AS
      (unit_price * fx_rate_to_dkk * (1 + transport_pct + tariff_pct))
    STORED;

COMMENT ON COLUMN purchase_order_lines.transport_pct IS
  'Transport markup snapshotted at PO line insert. Decimal (0.10 = 10 %). Default seeded from app_settings.default_transport_pct.';
COMMENT ON COLUMN purchase_order_lines.tariff_pct IS
  'EU import duty snapshotted at PO line insert from the part''s hs_codes.tariff_pct. Frozen the same way fx_rate_to_dkk is.';
COMMENT ON COLUMN purchase_order_lines.landed_cost_dkk_per_unit IS
  'unit_price × fx_rate_to_dkk × (1 + transport_pct + tariff_pct). Generated; never write directly.';

-- ----------------------------------------------------------------------------
-- 6. Recreate v_part_last_cost with the new formula
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_part_last_cost AS
SELECT DISTINCT ON (pol.part_id)
    pol.part_id,
    pol.unit_price * pol.fx_rate_to_dkk
      * (1 + pol.transport_pct + pol.tariff_pct) AS last_cost_dkk,
    pol.quantity        AS last_purchase_quantity,
    po.order_date       AS last_order_date
FROM purchase_order_lines pol
JOIN purchase_orders      po ON po.id = pol.purchase_order_id
ORDER BY pol.part_id, po.order_date DESC, pol.created_at DESC;

COMMENT ON VIEW public.v_part_last_cost IS
  'One row per part holding the landed DKK/unit, quantity, and date from the most recent PO line that referenced it. Formula matches the stored landed_cost_dkk_per_unit (base × (1 + transport_pct + tariff_pct)).';

-- ----------------------------------------------------------------------------
-- 7. Recreate v_parts_dashboard (same shape as migration 07, just rebuilt
--    on top of the new v_part_last_cost)
-- ----------------------------------------------------------------------------
CREATE VIEW v_parts_dashboard AS
SELECT
    p.id,
    p.internal_sku,
    p.name_en,
    p.name_da,
    p.description_en,
    p.description_da,
    p.category_id,
    p.deleted_at,
    p.reorder_point,
    p.reorder_quantity,
    cat.name_en          AS category_name,
    COALESCE(stock.qty, 0)::numeric  AS stock_on_hand,
    cost.last_cost_dkk,
    cost.last_purchase_quantity,
    cost.last_order_date,
    CASE
        WHEN COALESCE(stock.qty, 0) <= 0
            THEN 'out'
        WHEN p.reorder_point IS NOT NULL
             AND COALESCE(stock.qty, 0) <= p.reorder_point
            THEN 'low'
        WHEN p.reorder_point IS NULL
             AND cost.last_purchase_quantity > 0
             AND COALESCE(stock.qty, 0) <= cost.last_purchase_quantity * 0.2
            THEN 'low'
        ELSE 'ok'
    END                  AS stock_status,
    COALESCE(sup_count.n, 0)::integer AS supplier_count,
    primary_sup.name     AS primary_supplier_name
FROM parts p
LEFT JOIN part_categories cat ON cat.id = p.category_id
LEFT JOIN (
    SELECT part_id, SUM(quantity_on_hand) AS qty
    FROM v_current_stock
    GROUP BY part_id
) stock ON stock.part_id = p.id
LEFT JOIN v_part_last_cost cost ON cost.part_id = p.id
LEFT JOIN (
    SELECT part_id, COUNT(*) AS n
    FROM part_supplier_offerings
    GROUP BY part_id
) sup_count ON sup_count.part_id = p.id
LEFT JOIN LATERAL (
    SELECT s.name
    FROM part_supplier_offerings o
    JOIN suppliers s ON s.id = o.supplier_id
    WHERE o.part_id = p.id
    ORDER BY o.is_preferred DESC, s.name ASC
    LIMIT 1
) primary_sup ON true;

COMMENT ON VIEW v_parts_dashboard IS
  'One row per part with aggregated stock, last cost (additive landed formula), computed stock_status, supplier count, and primary supplier name. Used by /parts.';

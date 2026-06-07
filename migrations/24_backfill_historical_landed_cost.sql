-- 24_backfill_historical_landed_cost.sql
--
-- One-time DATA CORRECTION (not a re-rating). Every historical PO line
-- was imported in migration 14 BEFORE the HS codes existed (added this
-- cycle), so every line snapshotted tariff_pct = 0 and anti_dumping_pct
-- NULL. The duty was always legally owed on those imports — the lines
-- carry a data GAP, not a frozen-correct value. This corrects the gap.
--
-- The frozen-at-purchase rule protects against retroactively shifting
-- cost basis when a rate legitimately CHANGES going forward. It does
-- not bless leaving a known import-time gap uncorrected. Hence this
-- backfill is consistent with the architecture, not a violation of it.
--
-- Scope (confirmed against live data 2026-06):
--   - 155 PO lines were missing the base tariff (part has an active HS
--     code with tariff > 0 but the line snapshotted 0).
--   - 6 of those were also missing the 48.50 % anti-dumping.
--   - All 49 affected POs are 'received', so the cost propagated into
--     inventory_movements and (for 2 bikes) into build_cost_dkk.
--
-- Per the cost-accounting owner's decision (2026-06), the correction
-- propagates through ALL THREE layers:
--   Layer 1 — PO line tariff/anti-dumping (landed cost is GENERATED,
--             recomputes automatically).
--   Layer 2 — received inventory_movements.unit_cost_dkk (frozen
--             snapshot taken at receive; re-synced to the corrected
--             PO-line landed cost).
--   Layer 3 — consumed_build movements + bikes.build_cost_dkk
--             (2 built bikes, 1 already delivered; recomputed from the
--             corrected consumed costs).
--
-- Resolution mirrors resolveTariffPctForPart / resolveAntiDumpingPctForPart
-- in src/app/purchase-orders/[id]/_actions/manage-lines.ts: per-part
-- tariff_pct_override wins over the HS code; anti-dumping comes from the
-- active HS code only.

-- ---------- Layer 1: PO line tariff + anti-dumping --------------------
UPDATE purchase_order_lines pol
SET
  tariff_pct = COALESCE(
    p.tariff_pct_override,
    CASE WHEN h.is_active THEN h.tariff_pct ELSE 0 END,
    0
  ),
  anti_dumping_pct = CASE
    WHEN h.is_active AND h.anti_dumping_pct IS NOT NULL THEN h.anti_dumping_pct
    ELSE NULL
  END,
  updated_at = now()
FROM parts p
LEFT JOIN hs_codes h ON h.id = p.hs_code_id
WHERE pol.part_id = p.id
  AND p.hs_code_id IS NOT NULL;

-- ---------- Layer 2: received stock movement unit cost ----------------
UPDATE inventory_movements im
SET unit_cost_dkk = pol.landed_cost_dkk_per_unit
FROM purchase_order_lines pol
WHERE im.source_entity_type = 'purchase_order_line'
  AND im.source_entity_id = pol.id
  AND im.movement_type = 'received'
  AND im.unit_cost_dkk IS DISTINCT FROM pol.landed_cost_dkk_per_unit;

-- ---------- Layer 3a: consumed-build movement unit cost ---------------
UPDATE inventory_movements im
SET unit_cost_dkk = (
  SELECT r.unit_cost_dkk
  FROM bike_parts bp
  JOIN inventory_movements r ON r.part_id = bp.part_id
  WHERE bp.inventory_movement_id = im.id
    AND r.movement_type = 'received'
  ORDER BY r.occurred_at DESC
  LIMIT 1
)
WHERE im.movement_type = 'consumed_build'
  AND EXISTS (
    SELECT 1 FROM bike_parts bp2
    JOIN inventory_movements r2
      ON r2.part_id = bp2.part_id AND r2.movement_type = 'received'
    WHERE bp2.inventory_movement_id = im.id
  );

-- ---------- Layer 3b: recompute build_cost_dkk ------------------------
UPDATE bikes b
SET build_cost_dkk = sub.total, updated_at = now()
FROM (
  SELECT bp.bike_id, round(sum(bp.quantity * im.unit_cost_dkk), 4) AS total
  FROM bike_parts bp
  JOIN inventory_movements im ON im.id = bp.inventory_movement_id
  WHERE im.movement_type = 'consumed_build'
  GROUP BY bp.bike_id
) sub
WHERE b.id = sub.bike_id;

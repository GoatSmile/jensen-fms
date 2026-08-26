-- ============================================================================
-- 88 — Where a cost came from, and stock that arrived without a purchase order
-- ============================================================================
-- Stock does not only arrive through purchasing. Parts get found in storage
-- years after they were bought, counts get corrected upward, a supplier sends
-- a free replacement. The shop knows roughly what it paid; the system had
-- nowhere to put that number.
--
-- Until now `v_part_last_cost` read `purchase_order_lines` and nothing else, so
-- a part that never appeared on a PO had NO cost at all — not "approximate",
-- not "stale", but null. Everything downstream read that null as zero:
-- template cost-to-produce, MO build-cost projection, and `finishBikeBuild`,
-- which wrote `unit_cost_dkk = NULL` onto the consumption movement and left it
-- out of `bikes.build_cost_dkk`. Immutable ledger, silently short.
--
-- Meanwhile the app ALREADY captured everything needed. `adjustStock` takes an
-- amount, a currency, an ECB rate and a back-date, applies the same 4-dp
-- rounding as the PO landed-cost convention — and then wrote the result as
-- PROSE into `reason`:
--
--     test · Cost 40 USD @ 6.4781 (ECB 2026-08-11) = 259.124 DKK/unit.
--
-- The number was already in `unit_cost_dkk`. Only the resolver refused to look.
--
-- This migration does two things:
--
--   1. Records WHERE a cost came from, frozen at insert, the same way
--      `purchase_order_lines.import_tax_basis` freezes the reason for a zero.
--      A derived reason cannot be reconstructed later from mutable state.
--   2. Widens `v_part_last_cost` to consider every costed inbound event —
--      movements AND purchase-order lines — most recent wins.
--
-- DECISIONS 2026-08-26: a `stated` cost CAN outrank a real `purchase` cost when
-- it is newer. Recency wins across all bases. You just counted the shelf and
-- you know what you paid; that beats an older invoice. The cost of this is that
-- one adjustment can move the basis margins are built on, which is exactly why
-- the basis is recorded and shown rather than blended away.
--
-- NOT moved: `last_purchase_quantity` stays sourced from purchase orders. It
-- drives the low-stock threshold (on-hand <= 20% of last purchase qty) in
-- `v_parts_dashboard` and `src/lib/parts/stock.ts`, and no part has an explicit
-- `reorder_point` today, so that heuristic is what every low-stock badge in the
-- app currently runs on. Point it at movements and a +10 adjustment silently
-- sets a reorder threshold of 2. Cost moves to the ledger; reorder sizing stays
-- with purchasing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The basis enum
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unit_cost_basis') THEN
    CREATE TYPE public.unit_cost_basis AS ENUM (
      'purchase',  -- landed cost from a PO line: FX and duty buckets frozen
      'stated',    -- a human asserted it (found in storage, recount, free item)
      'derived',   -- inherited from the prevailing cost when stock left
      'none'       -- unknown: legacy rows only, new writes must not produce it
    );
  END IF;
END$$;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS unit_cost_basis public.unit_cost_basis;

-- ----------------------------------------------------------------------------
-- 2. Backfill from what the existing rows can prove
-- ----------------------------------------------------------------------------
-- Order matters: provenance first, then direction, then "a human typed it".
UPDATE public.inventory_movements
SET unit_cost_basis = (CASE
    WHEN unit_cost_dkk IS NULL                      THEN 'none'
    WHEN source_entity_type = 'purchase_order_line' THEN 'purchase'
    WHEN quantity_delta < 0                         THEN 'derived'
    ELSE 'stated'
  END)::public.unit_cost_basis
WHERE unit_cost_basis IS NULL;

ALTER TABLE public.inventory_movements
  ALTER COLUMN unit_cost_basis SET DEFAULT 'none',
  ALTER COLUMN unit_cost_basis SET NOT NULL;

COMMENT ON COLUMN public.inventory_movements.unit_cost_basis IS
  'Where unit_cost_dkk came from, frozen at insert. purchase = landed cost off '
  'a PO line; stated = a human asserted it; derived = inherited from the '
  'prevailing cost as stock left; none = unknown (legacy rows only).';

-- ----------------------------------------------------------------------------
-- 3. Widen the resolver
-- ----------------------------------------------------------------------------
-- CREATE OR REPLACE (not DROP): v_parts_dashboard depends on this view. The
-- first four columns keep their names, order and types; the two new ones are
-- appended, which is all OR REPLACE permits.
--
-- A received PO appears in both halves of the union with the same figure, so
-- the two sources agree rather than compete. An ORDERED-but-unreceived line
-- still answers, which is what the old view did and what stops this from being
-- a narrowing: a part on order has a price before the goods land.
CREATE OR REPLACE VIEW public.v_part_last_cost AS
WITH candidates AS (
    -- Every event that can say what one unit costs.
    SELECT m.part_id,
           m.unit_cost_dkk::numeric AS cost_dkk,
           m.unit_cost_basis        AS basis,
           m.occurred_at            AS cost_at,
           1                        AS src_rank  -- a real movement wins ties
    FROM public.inventory_movements m
    WHERE m.quantity_delta > 0
      AND m.unit_cost_dkk IS NOT NULL
    UNION ALL
    SELECT pol.part_id,
           pol.landed_cost_dkk_per_unit::numeric,
           'purchase'::public.unit_cost_basis,
           po.order_date::timestamptz,
           2
    FROM public.purchase_order_lines pol
    JOIN public.purchase_orders      po ON po.id = pol.purchase_order_id
    WHERE pol.landed_cost_dkk_per_unit IS NOT NULL
),
last_cost AS (
    SELECT DISTINCT ON (part_id) part_id, cost_dkk, basis, cost_at
    FROM candidates
    ORDER BY part_id, cost_at DESC NULLS LAST, src_rank
),
last_po AS (
    -- Purchasing only, deliberately — see the header note on reorder sizing.
    SELECT DISTINCT ON (pol.part_id)
           pol.part_id,
           pol.quantity   AS last_purchase_quantity,
           po.order_date  AS last_order_date
    FROM public.purchase_order_lines pol
    JOIN public.purchase_orders      po ON po.id = pol.purchase_order_id
    ORDER BY pol.part_id, po.order_date DESC NULLS LAST, pol.created_at DESC
)
SELECT COALESCE(c.part_id, l.part_id) AS part_id,
       c.cost_dkk                     AS last_cost_dkk,
       l.last_purchase_quantity,
       l.last_order_date,
       c.basis                        AS last_cost_basis,
       c.cost_at                      AS last_cost_at
FROM last_cost c
FULL OUTER JOIN last_po l ON l.part_id = c.part_id;

COMMENT ON VIEW public.v_part_last_cost IS
    'One row per part with the most recent known unit cost (DKK) and where it '
    'came from (last_cost_basis). Considers costed inbound movements AND '
    'purchase-order lines; most recent wins. last_purchase_quantity / '
    'last_order_date remain PURCHASE-sourced because they size reordering, '
    'not valuation.';

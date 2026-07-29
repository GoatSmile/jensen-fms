-- Data-invariant audit — states the app should never be able to produce.
--
-- Every check must report offenders = 0. A non-zero count means either the data
-- is wrong or the writer that produced it is. Strictly read-only.
--
-- Run it anywhere: the Supabase SQL editor, psql, or the MCP `execute_sql`
-- tool. Deliberately ONE file of plain SQL rather than a script — running
-- arbitrary SQL from Node would need either a new database secret or a
-- SECURITY DEFINER exec RPC, and under the permissive anon_all policy
-- (migration 50) such an RPC would be a live hole reachable with the anon key.
--
-- Checks prefixed GUARD are not bugs but standing operational facts we do not
-- want silently flipped — the e-conomic trial landmine and the two test-mode
-- switches. A red line beats a doc nobody re-reads.

select * from (

  select 1 as ord,
         'stranded bikes — planning/building with no MO' as check_name,
         count(*) as offenders,
         coalesce(string_agg(frame_number, ', ' order by frame_number), '—') as sample
  from bikes
  where manufacturing_order_id is null
    and status in ('planning', 'building')
    and deleted_at is null

  union all
  -- finishBikeBuild stamps build_cost_dkk. Bikes recorded via /bikes/new have
  -- no MO and deliberately carry no build cost, so they are excluded here.
  select 2, 'built bikes off an MO with no build cost',
         count(*), coalesce(string_agg(frame_number, ', ' order by frame_number), '—')
  from bikes
  where manufacturing_order_id is not null
    and status in ('in_stock', 'assigned', 'in_service')
    and build_cost_dkk is null
    and deleted_at is null

  union all
  -- "assigned" means assigned TO a customer, so the pair must move together.
  -- The SO delivery bulk-write flips in_stock -> assigned without touching the
  -- owner, and slating at SO-confirm only covers UNBUILT bikes — so a bike built
  -- before its SO was confirmed could in principle land here. Not reachable
  -- through the app today (sales_order_id is only ever written at MO creation,
  -- in spawn-mo.ts; nothing re-links an existing MO), which is exactly why this
  -- stays a cheap guard rather than a fix.
  select 2.5, 'bikes assigned or in service with no owner',
         count(*), coalesce(string_agg(frame_number, ', ' order by frame_number), '—')
  from bikes
  where status in ('assigned', 'in_service')
    and owner_organization_id is null
    and deleted_at is null

  union all
  -- inventory_movement_id is written only when stock is consumed at finish.
  select 3, 'frozen bike_parts on a bike still in planning',
         count(*), coalesce(string_agg(distinct b.frame_number, ', '), '—')
  from bike_parts bp
  join bikes b on b.id = bp.bike_id
  where bp.inventory_movement_id is not null
    and b.status = 'planning'
    and b.deleted_at is null

  union all
  -- landed_cost_dkk_per_unit is GENERATED ALWAYS from exactly this expression.
  -- anti_dumping_pct is part of it and is COALESCEd, not assumed present — it
  -- reaches 48.5 % on the affected HS codes, so omitting it here understates
  -- the expected value by more than a third (which is how the first run of this
  -- audit "found" six false divergences, and how CLAUDE.md's copy of the
  -- formula was found to be missing the term entirely).
  select 4, 'landed cost diverging from the generated-column formula',
         count(*), coalesce(string_agg(id::text, ', '), '—')
  from purchase_order_lines
  where landed_cost_dkk_per_unit is not null
    and abs(landed_cost_dkk_per_unit
            - unit_price * fx_rate_to_dkk
              * (1 + transport_pct + tariff_pct + coalesce(anti_dumping_pct, 0))) > 0.0001

  union all
  -- The basis records WHY tax was or wasn't applied; it cannot be
  -- reconstructed later, so it must agree with the number beside it.
  select 5, 'import-tax basis contradicting its own tariff snapshot',
         count(*), coalesce(string_agg(id::text, ', '), '—')
  from purchase_order_lines
  where (import_tax_basis = 'applied' and coalesce(tariff_pct, 0) = 0)
     or (import_tax_basis in ('zero_rated', 'unclassified', 'eu_origin', 'supplier_prepaid')
         and coalesce(tariff_pct, 0) <> 0)

  union all
  -- Send freezes supplier_item_no + unit_price + fx onto every line, and is
  -- blocked while any line is unpriced.
  select 6, 'sent service-order lines that were never frozen',
         count(*), coalesce(string_agg(distinct so.id::text, ', '), '—')
  from service_order_items soi
  join service_orders so on so.id = soi.service_order_id
  where so.status in ('sent', 'at_supplier', 'received_back')
    and (soi.unit_price is null or soi.fx_rate_to_dkk is null)

  union all
  select 7, 'two current price lists for one supplier + service type',
         count(*), coalesce(string_agg(supplier_id::text, ', '), '—')
  from (
    select supplier_id, service_type_id
    from service_price_lists
    where is_current
    group by supplier_id, service_type_id
    having count(*) > 1
  ) x

  union all
  select 8, 'two current versions of one bike template',
         count(*), coalesce(string_agg(name_en, ', '), '—')
  from (
    select name_en
    from bike_templates
    where is_current
    group by family_id, name_en, frame_size
    having count(*) > 1
  ) x

  union all
  -- Current stock is SUM(quantity_delta); negative means a double-consume or a
  -- missing receipt.
  select 9, 'negative stock for a part at a location',
         count(*), coalesce(string_agg(part_id::text, ', '), '—')
  from (
    select part_id
    from inventory_movements
    group by part_id, location_id
    having sum(quantity_delta) < 0
  ) x

  union all
  -- The INV number is allocated at issue and the series must stay gapless.
  -- 'cancelled' is excluded deliberately: a draft cancelled before issue never
  -- had a number allocated and legitimately keeps its DRAFT- placeholder.
  select 10, 'issued invoices still carrying a draft number',
         count(*), coalesce(string_agg(invoice_number, ', '), '—')
  from invoices
  where status not in ('draft', 'cancelled') and invoice_number like 'DRAFT-%'

  union all
  -- An issued invoice is immutable, so an empty one can only be credit-noted.
  select 11, 'issued invoices with no lines',
         count(*), coalesce(string_agg(i.invoice_number, ', '), '—')
  from invoices i
  where i.status <> 'draft'
    and not exists (select 1 from invoice_lines l where l.invoice_id = i.id)

  union all
  select 12, 'credit notes outside the CRE series',
         count(*), coalesce(string_agg(invoice_number, ', '), '—')
  from invoices
  where credited_invoice_id is not null
    and status <> 'draft'
    and invoice_number not like 'CRE-%'

  union all
  -- An archived or unset primary silently retargets every consumption and
  -- receipt to the first active location by code.
  select 13, 'the primary stock location is unset or inactive',
         count(*), coalesce(string_agg(coalesce(l.code, 'unset'), ', '), '—')
  from app_settings s
  left join inventory_locations l on l.id = s.primary_location_id
  where s.id = 1
    and (s.primary_location_id is null or l.is_active is not true)

  union all
  -- Anything stamped against the TRIAL agreement refers to a trial entity and
  -- must be cleared before the production token goes in. Zero is what keeps
  -- the e-conomic cutover safe.
  select 14, 'GUARD — e-conomic trial entities stamped on real records',
         count(*), coalesce(string_agg(kind || ' ' || ref, ', '), '—')
  from (
    select 'organization' as kind, economic_customer_number::text as ref
    from organizations where economic_customer_number is not null
    union all
    select 'invoice', coalesce(economic_voucher_id::text, economic_synced_at::text)
    from invoices where economic_voucher_id is not null or economic_synced_at is not null
  ) x

  union all
  -- outbound_test_mode is the only thing between "Email supplier" and real
  -- supplier inboxes; inbound_shadow_mode the only thing between the triage
  -- pipeline and real tickets. Both flip deliberately at cutover.
  select 15, 'GUARD — outbound email or inbound triage left unguarded',
         count(*),
         coalesce(string_agg('outbound_test_mode=' || outbound_test_mode
                             || ' inbound_shadow_mode=' || inbound_shadow_mode, ', '), '—')
  from app_settings
  where id = 1
    and (outbound_test_mode is not true or inbound_shadow_mode is not true)

  union all
  -- The invoice counter and the issued series must agree, or the next issue
  -- collides with or skips past an existing number.
  select 16, 'invoice counter out of step with the issued INV series',
         count(*), coalesce(string_agg(detail, ', '), '—')
  from (
    select 'counter=' || ds.current_value
           || ' highest_issued=' || coalesce(max_issued.n::text, 'none') as detail
    from document_sequences ds
    left join (
      -- 'INV-2026-' is NINE characters; left(…, 8) silently matches nothing and
      -- reports every counter as out of step.
      select max((regexp_replace(invoice_number, '^INV-\d{4}-', ''))::int) as n
      from invoices
      where invoice_number ~ '^INV-\d{4}-\d+$'
        and left(invoice_number, 9) = 'INV-' || extract(year from now())::int || '-'
    ) max_issued on true
    where ds.document_type = 'invoice'
      and ds.year = extract(year from now())::int
      and ds.current_value <> coalesce(max_issued.n, 0)
  ) x

) t
order by ord;

-- 82: atomic replace of a paint order's item lines — for "Fill from bikes".
--
-- The seeder recomputes an order's lines from the attached bikes' templates
-- and REPLACES what is there. Delete-then-insert over two PostgREST calls
-- would leave a hand-curated list wiped if the insert half fails, so both
-- sides go in one transaction, the same reason publish_service_price_list
-- exists (migration 64).
--
-- The `planned` check is repeated here rather than trusted from the caller:
-- lines freeze at send (their supplier_item_no / unit_price / currency /
-- fx_rate_to_dkk become the cost basis), so a replace against a sent order
-- would rewrite history. The server action checks too — this is the backstop
-- that holds if anything ever calls the function directly.
--
-- Grouping (part type × colour) is deliberately NOT done here: it needs the
-- bikes' templates and their per-bike quantities, and that logic belongs in
-- src/lib/services/paint-seed.ts where it is pure and testable. This function
-- takes finished lines and writes them.

create or replace function public.replace_service_order_items(
  p_order_id uuid,
  p_items jsonb
)
returns integer
language plpgsql
as $$
declare
  v_status text;
  v_count integer;
begin
  select status
    into v_status
    from public.service_orders
   where id = p_order_id
     for update;
  if not found then
    raise exception 'service order % not found', p_order_id;
  end if;
  if v_status <> 'planned' then
    raise exception 'service order % is %, not planned', p_order_id, v_status
      using errcode = 'check_violation';
  end if;

  delete from public.service_order_items
   where service_order_id = p_order_id;

  insert into public.service_order_items (
    service_order_id, service_part_type_id, quantity, color_id
  )
  select p_order_id,
         (i->>'service_part_type_id')::uuid,
         (i->>'quantity')::integer,
         nullif(i->>'color_id', '')::uuid
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

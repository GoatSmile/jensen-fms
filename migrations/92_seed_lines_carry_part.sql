-- ============================================================================
-- 92 — "Fill from bikes" seeds the specific part onto each paint-order line
-- ============================================================================
-- Painted parts are stock (migration 91): a paint-order line converts raw into
-- painted stock only when it names the specific part. The seeder now maps a
-- template's paintwork rows to the recipe parts paintable as that type, so an
-- order-tied paint order arrives with parts named. The atomic replace RPC
-- (migration 82) learns the column. Apply to BOTH databases.

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
    service_order_id, service_part_type_id, quantity, color_id, part_id
  )
  select p_order_id,
         (i->>'service_part_type_id')::uuid,
         (i->>'quantity')::integer,
         nullif(i->>'color_id', '')::uuid,
         nullif(i->>'part_id', '')::uuid
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

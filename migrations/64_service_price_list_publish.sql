-- 64: /admin/services support — atomic revision publish + tier-overlap guard.
--
-- Publishing a new price-list revision must demote the old current and
-- promote the new one in ONE transaction: uq_service_price_lists_current
-- (unique per supplier × service type where is_current) forbids two current
-- rows, so the app can't insert-then-flip, and flipping in two PostgREST
-- calls leaves a no-current-list window if the second call dies. The
-- function does both sides atomically; the app inserts the new revision as
-- is_current = false, seeds its items, then calls this.

create or replace function public.publish_service_price_list(p_list_id uuid)
returns void
language plpgsql
as $$
declare
  v_supplier uuid;
  v_type uuid;
begin
  select supplier_id, service_type_id
    into v_supplier, v_type
    from public.service_price_lists
   where id = p_list_id;
  if not found then
    raise exception 'price list % not found', p_list_id;
  end if;

  update public.service_price_lists
     set is_current = false
   where supplier_id = v_supplier
     and service_type_id = v_type
     and is_current
     and id <> p_list_id;

  update public.service_price_lists
     set is_current = true
   where id = p_list_id;
end;
$$;

-- Tier ranges for one part type on one list revision must not overlap —
-- resolveTierItem() picks the first match, so overlap would make the frozen
-- send price nondeterministic (found in the post-remodel review). NULL
-- tier_max = open-ended top tier. The '[]' bounds make [1,9] and [10,19]
-- adjacent-but-disjoint. Gaps stay allowed (an unpriced qty blocks the send
-- with a clear message — safe).

create extension if not exists btree_gist;

alter table public.service_price_items
  add constraint excl_service_price_items_tier_overlap
  exclude using gist (
    price_list_id with =,
    service_part_type_id with =,
    int4range(tier_min, tier_max, '[]') with &&
  );

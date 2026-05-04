create or replace function public.save_roadmap_item_order(
  p_roadmap_id uuid,
  p_item_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_item_count integer;
  v_distinct_item_count integer;
  v_valid_item_count integer;
  v_position_offset integer := 1000000;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.roadmaps
    where id = p_roadmap_id
      and user_id = v_user_id
  ) then
    raise exception 'Roadmap not found or not owned by current user';
  end if;

  v_item_count := coalesce(array_length(p_item_ids, 1), 0);

  select count(distinct item_id)
  into v_distinct_item_count
  from unnest(coalesce(p_item_ids, array[]::uuid[])) as input_ids(item_id);

  if v_distinct_item_count <> v_item_count then
    raise exception 'Roadmap item ids must be unique';
  end if;

  select count(*)
  into v_valid_item_count
  from public.roadmap_items
  where id = any(coalesce(p_item_ids, array[]::uuid[]))
    and roadmap_id = p_roadmap_id
    and user_id = v_user_id;

  if v_valid_item_count <> v_item_count then
    raise exception 'Roadmap item ids must all belong to the target roadmap and current user';
  end if;

  update public.roadmap_items
  set position = position + v_position_offset,
      updated_at = now()
  where roadmap_id = p_roadmap_id
    and user_id = v_user_id;

  update public.roadmap_items
  set position = ordered_items.ordinality,
      updated_at = now()
  from unnest(coalesce(p_item_ids, array[]::uuid[])) with ordinality as ordered_items(item_id, ordinality)
  where public.roadmap_items.id = ordered_items.item_id
    and public.roadmap_items.roadmap_id = p_roadmap_id
    and public.roadmap_items.user_id = v_user_id;

  with ordered_excluded as (
    select
      roadmap_item.id,
      v_item_count + row_number() over (
        order by roadmap_item.position asc, roadmap_item.id asc
      ) as next_position
    from public.roadmap_items as roadmap_item
    where roadmap_item.roadmap_id = p_roadmap_id
      and roadmap_item.user_id = v_user_id
      and not (roadmap_item.id = any(coalesce(p_item_ids, array[]::uuid[])))
  )
  update public.roadmap_items
  set position = ordered_excluded.next_position,
      updated_at = now()
  from ordered_excluded
  where public.roadmap_items.id = ordered_excluded.id;

  perform public.recalculate_goal_global_rank();
end;
$$;

alter table public.monuments
  add column if not exists priority_rank integer;

with ranked_monuments as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at asc, id asc
    )::integer as next_priority_rank
  from public.monuments
  where priority_rank is null
)
update public.monuments as monument
set priority_rank = ranked_monuments.next_priority_rank
from ranked_monuments
where monument.id = ranked_monuments.id
  and monument.priority_rank is null;

create index if not exists monuments_user_priority_rank_idx
  on public.monuments (user_id, priority_rank);

create or replace function public.save_monument_priority_order(
  p_monument_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_monument_count integer;
  v_distinct_monument_count integer;
  v_valid_monument_count integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_monument_count := coalesce(array_length(p_monument_ids, 1), 0);

  select count(distinct monument_id)
  into v_distinct_monument_count
  from unnest(coalesce(p_monument_ids, array[]::uuid[])) as input_ids(monument_id);

  if v_distinct_monument_count <> v_monument_count then
    raise exception 'Monument ids must be unique';
  end if;

  select count(*)
  into v_valid_monument_count
  from public.monuments
  where id = any(coalesce(p_monument_ids, array[]::uuid[]))
    and user_id = v_user_id;

  if v_valid_monument_count <> v_monument_count then
    raise exception 'Monument ids must all belong to the current user';
  end if;

  update public.monuments
  set priority_rank = ordered_monuments.ordinality
  from unnest(coalesce(p_monument_ids, array[]::uuid[])) with ordinality as ordered_monuments(monument_id, ordinality)
  where public.monuments.id = ordered_monuments.monument_id
    and public.monuments.user_id = v_user_id;

  with ordered_excluded as (
    select
      same_user_monument.id,
      v_monument_count + row_number() over (
        order by
          same_user_monument.priority_rank asc nulls last,
          same_user_monument.created_at asc,
          same_user_monument.id asc
      ) as next_priority_rank
    from public.monuments as same_user_monument
    where same_user_monument.user_id = v_user_id
      and not (same_user_monument.id = any(coalesce(p_monument_ids, array[]::uuid[])))
  )
  update public.monuments
  set priority_rank = ordered_excluded.next_priority_rank
  from ordered_excluded
  where public.monuments.id = ordered_excluded.id
    and public.monuments.user_id = v_user_id;

  perform public.recalculate_goal_global_rank();
end;
$$;

grant execute on function public.save_monument_priority_order(uuid[]) to authenticated;

create or replace function public.recalculate_goal_global_rank()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with owned_roadmaps as (
    select
      r.id,
      r.user_id,
      r.monument_id,
      r.created_at as roadmap_created_at,
      case when r.monument_id is null then 1 else 0 end as roadmap_null_sort,
      case
        when m.priority_rank is not null and m.priority_rank > 0 then 0
        else 1
      end as monument_priority_null_sort,
      coalesce(m.priority_rank, 2147483647) as monument_priority_sort,
      case
        when m.priority_rank is not null and m.priority_rank > 0 then null
        else m.created_at
      end as monument_fallback_created_at,
      case
        when m.priority_rank is not null and m.priority_rank > 0 then null
        else r.monument_id
      end as monument_fallback_id
    from public.roadmaps r
    left join public.monuments m
      on m.id = r.monument_id
     and m.user_id = r.user_id
  ),
  campaign_goal_slots as (
    select
      r.user_id,
      cg.goal_id,
      r.roadmap_null_sort,
      r.monument_priority_null_sort,
      r.monument_priority_sort,
      r.monument_fallback_created_at,
      r.monument_fallback_id,
      r.monument_id,
      r.roadmap_created_at,
      r.id as roadmap_id,
      ri.position as roadmap_position,
      cg.position as campaign_goal_position
    from public.roadmap_items ri
    join owned_roadmaps r
      on r.id = ri.roadmap_id
    join public.campaigns c
      on c.id = ri.campaign_id
     and c.user_id = r.user_id
     and (
       c.primary_monument_id is null
       or c.primary_monument_id is not distinct from r.monument_id
     )
    join public.campaign_goals cg
      on cg.campaign_id = c.id
     and cg.user_id = r.user_id
    where upper(trim(coalesce(ri.item_type, ''))) = 'CAMPAIGN'
      and cg.goal_id is not null
  ),
  standalone_goal_slots as (
    select
      r.user_id,
      ri.goal_id,
      r.roadmap_null_sort,
      r.monument_priority_null_sort,
      r.monument_priority_sort,
      r.monument_fallback_created_at,
      r.monument_fallback_id,
      r.monument_id,
      r.roadmap_created_at,
      r.id as roadmap_id,
      ri.position as roadmap_position,
      0 as campaign_goal_position
    from public.roadmap_items ri
    join owned_roadmaps r
      on r.id = ri.roadmap_id
    where upper(trim(coalesce(ri.item_type, ''))) = 'GOAL'
      and ri.goal_id is not null
      and not exists (
        select 1
        from campaign_goal_slots cgs
        where cgs.user_id = r.user_id
          and cgs.roadmap_id = r.id
          and cgs.goal_id = ri.goal_id
      )
  ),
  true_roadmap_slots as (
    select * from standalone_goal_slots

    union all

    select * from campaign_goal_slots
  ),
  deduped_true_roadmap_slots as (
    select
      trs.user_id,
      trs.goal_id,
      row_number() over (
        partition by trs.user_id, trs.goal_id
        order by
          trs.roadmap_null_sort asc,
          trs.monument_priority_null_sort asc,
          trs.monument_priority_sort asc,
          trs.monument_fallback_created_at asc nulls last,
          trs.monument_fallback_id asc nulls last,
          trs.roadmap_created_at asc,
          trs.roadmap_id asc,
          trs.roadmap_position asc,
          trs.campaign_goal_position asc,
          trs.goal_id asc
      ) as goal_occurrence_rank,
      row_number() over (
        partition by trs.user_id
        order by
          trs.roadmap_null_sort asc,
          trs.monument_priority_null_sort asc,
          trs.monument_priority_sort asc,
          trs.monument_fallback_created_at asc nulls last,
          trs.monument_fallback_id asc nulls last,
          trs.roadmap_created_at asc,
          trs.roadmap_id asc,
          trs.roadmap_position asc,
          trs.campaign_goal_position asc,
          trs.goal_id asc
      ) as flattened_position
    from true_roadmap_slots trs
  ),
  first_true_roadmap_slots as (
    select
      dtrs.user_id,
      dtrs.goal_id,
      dtrs.flattened_position
    from deduped_true_roadmap_slots dtrs
    where dtrs.goal_occurrence_rank = 1
  ),
  fallback_goals as (
    select
      g.user_id,
      g.id as goal_id,
      case upper(trim(coalesce(g.priority_code, g.priority::text, 'NO')))
        when 'ULTRA-CRITICAL' then 1
        when 'CRITICAL' then 2
        when 'HIGH' then 3
        when 'MEDIUM' then 4
        when 'LOW' then 5
        when 'NO' then 6
        else 7
      end as priority_sort,
      case
        when g.priority_rank is not null and g.priority_rank > 0 then 0
        else 1
      end as priority_rank_null_sort,
      coalesce(g.priority_rank, 2147483647) as priority_rank_sort,
      g.created_at
    from public.goals g
    left join first_true_roadmap_slots ftrs
      on ftrs.user_id = g.user_id
     and ftrs.goal_id = g.id
    where ftrs.goal_id is null
  ),
  unified_goal_order as (
    select
      ftrs.user_id,
      ftrs.goal_id,
      0 as source_sort,
      ftrs.flattened_position as true_roadmap_position,
      0 as priority_sort,
      0 as priority_rank_null_sort,
      0 as priority_rank_sort,
      'epoch'::timestamptz as created_at
    from first_true_roadmap_slots ftrs

    union all

    select
      fg.user_id,
      fg.goal_id,
      1 as source_sort,
      2147483647 as true_roadmap_position,
      fg.priority_sort,
      fg.priority_rank_null_sort,
      fg.priority_rank_sort,
      fg.created_at
    from fallback_goals fg
  ),
  ranked_goals as (
    select
      ugo.user_id,
      ugo.goal_id,
      row_number() over (
        partition by ugo.user_id
        order by
          ugo.source_sort asc,
          ugo.true_roadmap_position asc,
          ugo.priority_sort asc,
          ugo.priority_rank_null_sort asc,
          ugo.priority_rank_sort asc,
          ugo.created_at asc,
          ugo.goal_id asc
      ) as new_global_rank
    from unified_goal_order ugo
  )
  update public.goals g
  set global_rank = rg.new_global_rank
  from ranked_goals rg
  where g.user_id = rg.user_id
    and g.id = rg.goal_id;
end;
$$;

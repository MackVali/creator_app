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
      r.monument_id
    from public.roadmaps r
  ),
  campaign_goal_slots as (
    select
      r.user_id,
      cg.goal_id,
      case when r.monument_id is null then 1 else 0 end as roadmap_null_sort,
      coalesce(r.monument_id::text, '') as roadmap_monument_sort,
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
      case when r.monument_id is null then 1 else 0 end as roadmap_null_sort,
      coalesce(r.monument_id::text, '') as roadmap_monument_sort,
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
          trs.roadmap_monument_sort asc,
          trs.roadmap_id asc,
          trs.roadmap_position asc,
          trs.campaign_goal_position asc,
          trs.goal_id asc
      ) as goal_occurrence_rank,
      row_number() over (
        partition by trs.user_id
        order by
          trs.roadmap_null_sort asc,
          trs.roadmap_monument_sort asc,
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

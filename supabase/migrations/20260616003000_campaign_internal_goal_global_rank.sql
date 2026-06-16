create or replace function public.recalculate_goal_global_rank()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with eligible_goals as (
    select
      g.user_id,
      g.id,
      g.priority,
      g.priority_code,
      g.priority_order,
      g.priority_rank,
      g.created_at
    from public.goals g
    where upper(trim(coalesce(g.status, ''))) <> 'COMPLETED'
      and g.circle_id is null
  ),
  campaign_goal_candidates as (
    select
      cg.user_id,
      cg.goal_id,
      true as is_campaign_linked,
      case upper(trim(coalesce(c.priority_code, 'LOW')))
        when 'ULTRA-CRITICAL' then 1
        when 'CRITICAL' then 2
        when 'HIGH' then 3
        when 'MEDIUM' then 4
        when 'LOW' then 5
        when 'NO' then 6
        else 7
      end as effective_priority_sort,
      case when c.priority_order is null then 1 else 0 end as effective_priority_order_null_sort,
      coalesce(c.priority_order, 2147483647) as effective_priority_order_sort,
      case upper(trim(coalesce(g.priority_code, g.priority::text, 'NO')))
        when 'ULTRA-CRITICAL' then 1
        when 'CRITICAL' then 2
        when 'HIGH' then 3
        when 'MEDIUM' then 4
        when 'LOW' then 5
        when 'NO' then 6
        else 7
      end as campaign_internal_priority_sort,
      case when g.priority_order is null then 1 else 0 end as campaign_internal_priority_order_null_sort,
      coalesce(g.priority_order, 2147483647) as campaign_internal_priority_order_sort,
      case when g.priority_rank is null then 1 else 0 end as campaign_internal_rank_null_sort,
      coalesce(g.priority_rank, 2147483647) as campaign_internal_rank_sort,
      case when cg.position is null then 1 else 0 end as campaign_position_null_sort,
      coalesce(cg.position, 2147483647) as campaign_position_sort,
      c.created_at as campaign_created_at,
      c.id as campaign_id,
      g.created_at as goal_created_at
    from public.campaign_goals cg
    join public.campaigns c
      on c.id = cg.campaign_id
     and c.user_id = cg.user_id
    join eligible_goals g
      on g.id = cg.goal_id
     and g.user_id = cg.user_id
  ),
  standalone_goal_candidates as (
    select
      g.user_id,
      g.id as goal_id,
      false as is_campaign_linked,
      case upper(trim(coalesce(g.priority_code, g.priority::text, 'NO')))
        when 'ULTRA-CRITICAL' then 1
        when 'CRITICAL' then 2
        when 'HIGH' then 3
        when 'MEDIUM' then 4
        when 'LOW' then 5
        when 'NO' then 6
        else 7
      end as effective_priority_sort,
      case when g.priority_order is null then 1 else 0 end as effective_priority_order_null_sort,
      coalesce(g.priority_order, 2147483647) as effective_priority_order_sort,
      2147483647 as campaign_internal_priority_sort,
      1 as campaign_internal_priority_order_null_sort,
      2147483647 as campaign_internal_priority_order_sort,
      1 as campaign_internal_rank_null_sort,
      2147483647 as campaign_internal_rank_sort,
      1 as campaign_position_null_sort,
      2147483647 as campaign_position_sort,
      null::timestamptz as campaign_created_at,
      null::uuid as campaign_id,
      g.created_at as goal_created_at
    from eligible_goals g
    where not exists (
      select 1
      from public.campaign_goals cg
      join public.campaigns c
        on c.id = cg.campaign_id
       and c.user_id = cg.user_id
      where cg.goal_id = g.id
        and cg.user_id = g.user_id
    )
  ),
  goal_rank_candidates as (
    select * from campaign_goal_candidates

    union all

    select * from standalone_goal_candidates
  ),
  deduped_goal_candidates as (
    select
      grc.*,
      row_number() over (
        partition by grc.user_id, grc.goal_id
        order by
          grc.effective_priority_sort asc,
          grc.effective_priority_order_null_sort asc,
          grc.effective_priority_order_sort asc,
          grc.campaign_created_at asc nulls last,
          grc.campaign_id asc nulls last,
          grc.campaign_internal_priority_sort asc,
          grc.campaign_internal_priority_order_null_sort asc,
          grc.campaign_internal_priority_order_sort asc,
          grc.campaign_internal_rank_null_sort asc,
          grc.campaign_internal_rank_sort asc,
          grc.campaign_position_null_sort asc,
          grc.campaign_position_sort asc,
          grc.goal_created_at asc nulls last,
          grc.goal_id asc
      ) as goal_occurrence_rank
    from goal_rank_candidates grc
  ),
  ranked_goals as (
    select
      dgc.user_id,
      dgc.goal_id,
      row_number() over (
        partition by dgc.user_id
        order by
          dgc.effective_priority_sort asc,
          dgc.effective_priority_order_null_sort asc,
          dgc.effective_priority_order_sort asc,
          dgc.campaign_internal_priority_sort asc,
          dgc.campaign_internal_priority_order_null_sort asc,
          dgc.campaign_internal_priority_order_sort asc,
          dgc.campaign_internal_rank_null_sort asc,
          dgc.campaign_internal_rank_sort asc,
          dgc.campaign_position_null_sort asc,
          dgc.campaign_position_sort asc,
          dgc.goal_created_at asc nulls last,
          dgc.goal_id asc
      ) as new_global_rank
    from deduped_goal_candidates dgc
    where dgc.goal_occurrence_rank = 1
  ),
  goal_rank_updates as (
    select
      g.user_id,
      g.id as goal_id,
      rg.new_global_rank
    from public.goals g
    left join ranked_goals rg
      on rg.user_id = g.user_id
     and rg.goal_id = g.id
  )
  update public.goals g
  set global_rank = goal_rank_updates.new_global_rank
  from goal_rank_updates
  where g.user_id = goal_rank_updates.user_id
    and g.id = goal_rank_updates.goal_id
    and g.global_rank is distinct from goal_rank_updates.new_global_rank;
end;
$$;

select public.recalculate_goal_global_rank();

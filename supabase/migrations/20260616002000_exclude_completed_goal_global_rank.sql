create or replace function public.recalculate_goal_global_rank()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with campaign_goal_candidates as (
    select
      cg.user_id,
      cg.goal_id,
      case upper(trim(coalesce(c.priority_code, 'LOW')))
        when 'ULTRA-CRITICAL' then 1
        when 'CRITICAL' then 2
        when 'HIGH' then 3
        when 'MEDIUM' then 4
        when 'LOW' then 5
        when 'NO' then 6
        else 7
      end as priority_sort,
      case when c.priority_order is not null and c.priority_order > 0 then 0 else 1 end as priority_order_null_sort,
      coalesce(c.priority_order, 2147483647) as priority_order_sort,
      c.created_at as effective_created_at,
      c.id as effective_id,
      case upper(trim(coalesce(g.priority_code, g.priority::text, 'NO')))
        when 'ULTRA-CRITICAL' then 1
        when 'CRITICAL' then 2
        when 'HIGH' then 3
        when 'MEDIUM' then 4
        when 'LOW' then 5
        when 'NO' then 6
        else 7
      end as internal_priority_sort,
      case when g.priority_order is not null and g.priority_order > 0 then 0 else 1 end as internal_priority_order_null_sort,
      coalesce(g.priority_order, 2147483647) as internal_priority_order_sort,
      coalesce(cg.position, 2147483647) as campaign_goal_position,
      g.created_at as goal_created_at
    from public.campaign_goals cg
    join public.campaigns c
      on c.id = cg.campaign_id
     and c.user_id = cg.user_id
    join public.goals g
      on g.id = cg.goal_id
     and g.user_id = cg.user_id
    where upper(trim(coalesce(g.status, ''))) <> 'COMPLETED'
  ),
  standalone_goal_candidates as (
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
      case when g.priority_order is not null and g.priority_order > 0 then 0 else 1 end as priority_order_null_sort,
      coalesce(g.priority_order, 2147483647) as priority_order_sort,
      g.created_at as effective_created_at,
      g.id as effective_id,
      case upper(trim(coalesce(g.priority_code, g.priority::text, 'NO')))
        when 'ULTRA-CRITICAL' then 1
        when 'CRITICAL' then 2
        when 'HIGH' then 3
        when 'MEDIUM' then 4
        when 'LOW' then 5
        when 'NO' then 6
        else 7
      end as internal_priority_sort,
      case when g.priority_order is not null and g.priority_order > 0 then 0 else 1 end as internal_priority_order_null_sort,
      coalesce(g.priority_order, 2147483647) as internal_priority_order_sort,
      0 as campaign_goal_position,
      g.created_at as goal_created_at
    from public.goals g
    where upper(trim(coalesce(g.status, ''))) <> 'COMPLETED'
      and not exists (
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
          grc.priority_sort asc,
          grc.priority_order_null_sort asc,
          grc.priority_order_sort asc,
          grc.effective_created_at asc,
          grc.effective_id asc,
          grc.internal_priority_sort asc,
          grc.internal_priority_order_null_sort asc,
          grc.internal_priority_order_sort asc,
          grc.campaign_goal_position asc,
          grc.goal_created_at asc,
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
          dgc.priority_sort asc,
          dgc.priority_order_null_sort asc,
          dgc.priority_order_sort asc,
          dgc.effective_created_at asc,
          dgc.effective_id asc,
          dgc.internal_priority_sort asc,
          dgc.internal_priority_order_null_sort asc,
          dgc.internal_priority_order_sort asc,
          dgc.campaign_goal_position asc,
          dgc.goal_created_at asc,
          dgc.goal_id asc
      ) as new_global_rank
    from deduped_goal_candidates dgc
    where dgc.goal_occurrence_rank = 1
  ),
  goal_rank_updates as (
    select
      ranked_goals.user_id,
      ranked_goals.goal_id,
      ranked_goals.new_global_rank
    from ranked_goals

    union all

    select
      g.user_id,
      g.id as goal_id,
      null::bigint as new_global_rank
    from public.goals g
    where upper(trim(coalesce(g.status, ''))) = 'COMPLETED'
       or not exists (
         select 1
         from ranked_goals rg
         where rg.user_id = g.user_id
           and rg.goal_id = g.id
       )
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

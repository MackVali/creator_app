create or replace function public.recalculate_goal_global_rank()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with recursive eligible_goals as (
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
  campaign_goal_edges as (
    select
      cg.user_id,
      c.id as campaign_id,
      regexp_replace(
        lower(coalesce(nullif(trim(c.name), ''), 'Untitled Campaign')),
        '\s+',
        ' ',
        'g'
      ) as normalized_campaign_name,
      c.priority_code as campaign_priority_code,
      c.priority_order as campaign_priority_order,
      c.created_at as campaign_created_at,
      cg.goal_id,
      cg.position as campaign_goal_position,
      g.priority,
      g.priority_code,
      g.priority_order,
      g.priority_rank,
      g.created_at as goal_created_at
    from public.campaign_goals cg
    join public.campaigns c
      on c.id = cg.campaign_id
     and c.user_id = cg.user_id
    join eligible_goals g
      on g.id = cg.goal_id
     and g.user_id = cg.user_id
  ),
  campaign_nodes as (
    select distinct
      cge.user_id,
      cge.normalized_campaign_name,
      cge.campaign_id
    from campaign_goal_edges cge
  ),
  campaign_overlap_pairs as (
    select distinct
      left_edge.user_id,
      left_edge.normalized_campaign_name,
      left_edge.campaign_id as campaign_id,
      right_edge.campaign_id as overlapping_campaign_id
    from campaign_goal_edges left_edge
    join campaign_goal_edges right_edge
      on right_edge.user_id = left_edge.user_id
     and right_edge.normalized_campaign_name = left_edge.normalized_campaign_name
     and right_edge.goal_id = left_edge.goal_id
  ),
  campaign_component_walk as (
    select
      cn.user_id,
      cn.normalized_campaign_name,
      cn.campaign_id as root_campaign_id,
      cn.campaign_id
    from campaign_nodes cn

    union

    select
      ccw.user_id,
      ccw.normalized_campaign_name,
      ccw.root_campaign_id,
      cop.overlapping_campaign_id as campaign_id
    from campaign_component_walk ccw
    join campaign_overlap_pairs cop
      on cop.user_id = ccw.user_id
     and cop.normalized_campaign_name = ccw.normalized_campaign_name
     and cop.campaign_id = ccw.campaign_id
  ),
  campaign_components as (
    select
      ccw.user_id,
      ccw.normalized_campaign_name,
      ccw.campaign_id,
      min(ccw.root_campaign_id::text) as campaign_group_id
    from campaign_component_walk ccw
    group by
      ccw.user_id,
      ccw.normalized_campaign_name,
      ccw.campaign_id
  ),
  campaign_group_source_rows as (
    select distinct
      cc.user_id,
      cc.normalized_campaign_name,
      cc.campaign_group_id,
      cge.campaign_id,
      case upper(trim(coalesce(cge.campaign_priority_code, 'NO')))
        when 'ULTRA-CRITICAL' then 1
        when 'CRITICAL' then 2
        when 'HIGH' then 3
        when 'MEDIUM' then 4
        when 'LOW' then 5
        when 'NO' then 6
        else 6
      end as campaign_priority_sort,
      case
        when cge.campaign_priority_order is not null
         and cge.campaign_priority_order > 0 then 0
        else 1
      end as campaign_priority_order_null_sort,
      case
        when cge.campaign_priority_order is not null
         and cge.campaign_priority_order > 0 then cge.campaign_priority_order
        else 2147483647
      end as campaign_priority_order_sort,
      cge.campaign_created_at
    from campaign_components cc
    join campaign_goal_edges cge
      on cge.user_id = cc.user_id
     and cge.normalized_campaign_name = cc.normalized_campaign_name
     and cge.campaign_id = cc.campaign_id
  ),
  ranked_campaign_group_source_rows as (
    select
      cgsr.*,
      row_number() over (
        partition by
          cgsr.user_id,
          cgsr.normalized_campaign_name,
          cgsr.campaign_group_id
        order by
          cgsr.campaign_priority_sort asc,
          cgsr.campaign_priority_order_null_sort asc,
          cgsr.campaign_priority_order_sort asc,
          cgsr.campaign_created_at asc nulls last,
          cgsr.campaign_id asc
      ) as source_row_rank
    from campaign_group_source_rows cgsr
  ),
  campaign_group_placement as (
    select
      rcgsr.user_id,
      rcgsr.normalized_campaign_name,
      rcgsr.campaign_group_id,
      rcgsr.campaign_priority_sort as effective_priority_sort,
      rcgsr.campaign_priority_order_null_sort as effective_priority_order_null_sort,
      rcgsr.campaign_priority_order_sort as effective_priority_order_sort,
      rcgsr.campaign_created_at as top_level_created_at,
      rcgsr.campaign_id as top_level_id
    from ranked_campaign_group_source_rows rcgsr
    where rcgsr.source_row_rank = 1
  ),
  campaign_group_goal_rows as (
    select
      cc.user_id,
      cc.normalized_campaign_name,
      cc.campaign_group_id,
      cge.goal_id,
      cge.priority,
      cge.priority_code,
      cge.priority_order,
      cge.priority_rank,
      cge.goal_created_at,
      min(cge.campaign_goal_position) filter (
        where cge.campaign_goal_position is not null
          and cge.campaign_goal_position > 0
      ) as campaign_position_sort
    from campaign_components cc
    join campaign_goal_edges cge
      on cge.user_id = cc.user_id
     and cge.normalized_campaign_name = cc.normalized_campaign_name
     and cge.campaign_id = cc.campaign_id
    group by
      cc.user_id,
      cc.normalized_campaign_name,
      cc.campaign_group_id,
      cge.goal_id,
      cge.priority,
      cge.priority_code,
      cge.priority_order,
      cge.priority_rank,
      cge.goal_created_at
  ),
  campaign_goal_candidates as (
    select
      cggr.user_id,
      cggr.goal_id,
      true as is_campaign_linked,
      cgp.effective_priority_sort,
      cgp.effective_priority_order_null_sort,
      cgp.effective_priority_order_sort,
      cgp.top_level_created_at,
      cgp.top_level_id,
      case upper(trim(coalesce(cggr.priority_code, cggr.priority::text, 'NO')))
        when 'ULTRA-CRITICAL' then 1
        when 'CRITICAL' then 2
        when 'HIGH' then 3
        when 'MEDIUM' then 4
        when 'LOW' then 5
        when 'NO' then 6
        else 6
      end as campaign_internal_priority_sort,
      case
        when cggr.priority_order is not null
         and cggr.priority_order > 0 then 0
        else 1
      end as campaign_internal_priority_order_null_sort,
      case
        when cggr.priority_order is not null
         and cggr.priority_order > 0 then cggr.priority_order
        else 2147483647
      end as campaign_internal_priority_order_sort,
      case
        when cggr.priority_rank is not null
         and cggr.priority_rank > 0 then 0
        else 1
      end as campaign_internal_rank_null_sort,
      case
        when cggr.priority_rank is not null
         and cggr.priority_rank > 0 then cggr.priority_rank
        else 2147483647
      end as campaign_internal_rank_sort,
      case when cggr.campaign_position_sort is null then 1 else 0 end as campaign_position_null_sort,
      coalesce(cggr.campaign_position_sort, 2147483647) as campaign_position_sort,
      cggr.goal_created_at
    from campaign_group_goal_rows cggr
    join campaign_group_placement cgp
      on cgp.user_id = cggr.user_id
     and cgp.normalized_campaign_name = cggr.normalized_campaign_name
     and cgp.campaign_group_id = cggr.campaign_group_id
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
        else 6
      end as effective_priority_sort,
      case
        when g.priority_order is not null
         and g.priority_order > 0 then 0
        else 1
      end as effective_priority_order_null_sort,
      case
        when g.priority_order is not null
         and g.priority_order > 0 then g.priority_order
        else 2147483647
      end as effective_priority_order_sort,
      g.created_at as top_level_created_at,
      g.id as top_level_id,
      2147483647 as campaign_internal_priority_sort,
      1 as campaign_internal_priority_order_null_sort,
      2147483647 as campaign_internal_priority_order_sort,
      1 as campaign_internal_rank_null_sort,
      2147483647 as campaign_internal_rank_sort,
      1 as campaign_position_null_sort,
      2147483647 as campaign_position_sort,
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
          grc.top_level_created_at asc nulls last,
          grc.top_level_id asc,
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
          dgc.top_level_created_at asc nulls last,
          dgc.top_level_id asc,
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

-- Verification query for the merged BETA-READY Campaign group:
-- with recursive eligible_goals as (
--   select g.user_id, g.id, g.name, g.priority, g.priority_code, g.priority_order,
--          g.priority_rank, g.global_rank, g.created_at
--   from public.goals g
--   where upper(trim(coalesce(g.status, ''))) <> 'COMPLETED'
--     and g.circle_id is null
-- ),
-- campaign_goal_edges as (
--   select cg.user_id, c.id as campaign_id,
--          regexp_replace(
--            lower(coalesce(nullif(trim(c.name), ''), 'Untitled Campaign')),
--            '\s+',
--            ' ',
--            'g'
--          ) as normalized_campaign_name,
--          cg.goal_id
--   from public.campaign_goals cg
--   join public.campaigns c on c.id = cg.campaign_id and c.user_id = cg.user_id
--   join eligible_goals g on g.id = cg.goal_id and g.user_id = cg.user_id
-- ),
-- campaign_nodes as (
--   select distinct user_id, normalized_campaign_name, campaign_id
--   from campaign_goal_edges
-- ),
-- campaign_overlap_pairs as (
--   select distinct l.user_id, l.normalized_campaign_name, l.campaign_id,
--          r.campaign_id as overlapping_campaign_id
--   from campaign_goal_edges l
--   join campaign_goal_edges r
--     on r.user_id = l.user_id
--    and r.normalized_campaign_name = l.normalized_campaign_name
--    and r.goal_id = l.goal_id
-- ),
-- campaign_component_walk as (
--   select user_id, normalized_campaign_name, campaign_id as root_campaign_id, campaign_id
--   from campaign_nodes
--   union
--   select w.user_id, w.normalized_campaign_name, w.root_campaign_id,
--          p.overlapping_campaign_id
--   from campaign_component_walk w
--   join campaign_overlap_pairs p
--     on p.user_id = w.user_id
--    and p.normalized_campaign_name = w.normalized_campaign_name
--    and p.campaign_id = w.campaign_id
-- ),
-- campaign_components as (
--   select user_id, normalized_campaign_name, campaign_id,
--          min(root_campaign_id::text) as campaign_group_id
--   from campaign_component_walk
--   group by user_id, normalized_campaign_name, campaign_id
-- ),
-- beta_group as (
--   select user_id, normalized_campaign_name, campaign_group_id
--   from campaign_components
--   where normalized_campaign_name = 'beta-ready'
--   group by user_id, normalized_campaign_name, campaign_group_id
-- ),
-- expected_goals as (
--   select *
--   from (
--     values
--       ('CREATOR MONETIZATION', 1),
--       ('SIGN UP FLOW', 2),
--       ('SAFETY MEASURES', 3),
--       ('NOTIFICATIONS', 4)
--   ) as expected(goal_name, expected_position)
-- )
-- select
--   bg.campaign_group_id,
--   array_agg(distinct cc.campaign_id order by cc.campaign_id) as source_campaign_ids,
--   array_agg(g.name order by g.global_rank) as observed_order,
--   array_agg(g.name order by g.global_rank) = array[
--     'CREATOR MONETIZATION',
--     'SIGN UP FLOW',
--     'SAFETY MEASURES',
--     'NOTIFICATIONS'
--   ]::text[] as matches_expected
-- from beta_group bg
-- join campaign_components cc
--   on cc.user_id = bg.user_id
--  and cc.normalized_campaign_name = bg.normalized_campaign_name
--  and cc.campaign_group_id = bg.campaign_group_id
-- join public.campaign_goals cg
--   on cg.user_id = cc.user_id
--  and cg.campaign_id = cc.campaign_id
-- join public.goals g
--   on g.user_id = cg.user_id
--  and g.id = cg.goal_id
-- join expected_goals eg
--   on upper(g.name) = eg.goal_name
-- group by bg.campaign_group_id
-- having count(distinct g.id) = 4;

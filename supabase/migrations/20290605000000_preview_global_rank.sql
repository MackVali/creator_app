-- preview_global_rank: compute projected global rank/score for a draft project
create or replace function public.preview_global_rank(
  in p_goal_id uuid,
  in p_project_priority text,
  in p_project_stage text,
  out score bigint,
  out projected_rank_after_ties int,
  out projected_percentile numeric,
  out notes text
) returns record
language sql
stable
as $$
with g as (
  select priority
  from public.goals
  where id = p_goal_id
),
norm as (
  select
    upper(coalesce((select priority from g), '')) as gpri,
    upper(coalesce(p_project_priority, '')) as ppri,
    upper(coalesce(p_project_stage, '')) as pstg
),
weights as (
  select
    case gpri
      when 'ULTRA-CRITICAL' then 6
      when 'CRITICAL'       then 5
      when 'HIGH'           then 4
      when 'MEDIUM'         then 3
      when 'LOW'            then 2
      else 1
    end * 1000000
    +
    case ppri
      when 'ULTRA-CRITICAL' then 6
      when 'CRITICAL'       then 5
      when 'HIGH'           then 4
      when 'MEDIUM'         then 3
      when 'LOW'            then 2
      else 1
    end * 10000
    +
    case pstg
      when 'RESEARCH' then 6
      when 'TEST'     then 5
      when 'REFINE'   then 4
      when 'BUILD'    then 3
      when 'RELEASE'  then 2
      else 1
    end as calc_score,
    gpri, ppri, pstg
  from norm
),
eligible as (
  -- mirror recalculate_global_rank scope: incomplete projects only
  select
    ( case g.priority
        when 'ULTRA-CRITICAL' then 6
        when 'CRITICAL'       then 5
        when 'HIGH'           then 4
        when 'MEDIUM'         then 3
        when 'LOW'            then 2
        else 1
      end * 1000000
    ) +
    ( case p.priority
        when 'ULTRA-CRITICAL' then 6
        when 'CRITICAL'       then 5
        when 'HIGH'           then 4
        when 'MEDIUM'         then 3
        when 'LOW'            then 2
        else 1
      end * 10000
    ) +
    ( case p.stage
        when 'RESEARCH' then 6
        when 'TEST'     then 5
        when 'REFINE'   then 4
        when 'BUILD'    then 3
        when 'RELEASE'  then 2
        else 1
      end * 100
    ) as existing_score
  from public.projects p
  join public.goals g on g.id = p.goal_id
  where p.completed_at is null
),
totals as (
  select count(*)::int as total from eligible
),
cmp as (
  select
    (select count(*) from eligible where existing_score > (select calc_score from weights)) as better,
    (select count(*) from eligible where existing_score = (select calc_score from weights)) as ties
)
select
  (select calc_score from weights)                            as score,
  1 + better + ties                                          as projected_rank_after_ties,
  case when totals.total = 0 then 100.00
       else round(100 * (1 - (better::float / totals.total)), 2)
  end                                                        as projected_percentile,
  'Based on goal priority ≫ project priority ≫ stage; incomplete projects only; ties placed after equals.'::text
from cmp, totals;
$$;

-- indexes to keep the scope filter and score lookup snappy
create index if not exists idx_projects_incomplete_goal on public.projects (goal_id) where completed_at is null;
create index if not exists idx_projects_completed_null on public.projects ((completed_at is null));

-- grant execute to authenticated users (adjust role name if different)
grant execute on function public.preview_global_rank(uuid, text, text) to authenticated;

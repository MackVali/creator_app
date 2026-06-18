alter table if exists public.projects
  add column if not exists global_rank bigint;

create index if not exists projects_user_global_rank_idx
  on public.projects(user_id, global_rank)
  where completed_at is null;

create or replace function public.recalculate_project_global_rank()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with eligible_projects as (
    select
      p.id,
      p.user_id,
      row_number() over (
        partition by p.user_id
        order by
          coalesce(g.global_rank, 2147483647) asc,
          case upper(trim(coalesce(p.priority::text, 'NO')))
            when 'ULTRA-CRITICAL' then 1
            when 'CRITICAL' then 2
            when 'HIGH' then 3
            when 'MEDIUM' then 4
            when 'LOW' then 5
            when 'NO' then 6
            else 7
          end asc,
          case upper(trim(coalesce(p.stage::text, '')))
            when 'RESEARCH' then 1
            when 'TEST' then 2
            when 'REFINE' then 3
            when 'BUILD' then 4
            when 'RELEASE' then 5
            else 6
          end asc,
          p.due_date asc nulls last,
          p.created_at asc nulls last,
          p.id asc
      ) as new_global_rank
    from public.projects p
    left join public.goals g
      on g.id = p.goal_id
     and g.user_id = p.user_id
    where p.completed_at is null
      and coalesce(upper(trim(g.status)), '') <> 'COMPLETED'
  ),
  project_rank_updates as (
    select
      ep.id,
      ep.new_global_rank
    from eligible_projects ep

    union all

    select
      p.id,
      null::bigint as new_global_rank
    from public.projects p
    where p.completed_at is not null
       or not exists (
         select 1
         from eligible_projects ep
         where ep.id = p.id
       )
  )
  update public.projects p
  set global_rank = project_rank_updates.new_global_rank
  from project_rank_updates
  where p.id = project_rank_updates.id
    and p.global_rank is distinct from project_rank_updates.new_global_rank;
end;
$$;

create or replace function public.recalculate_global_rank()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalculate_project_global_rank();
end;
$$;

create or replace function public.trigger_recalculate_project_global_rank()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalculate_project_global_rank();
  return null;
end;
$$;

drop trigger if exists projects_recalculate_project_global_rank_insert on public.projects;
create trigger projects_recalculate_project_global_rank_insert
after insert on public.projects
for each statement
execute function public.trigger_recalculate_project_global_rank();

drop trigger if exists projects_recalculate_project_global_rank_update on public.projects;
create trigger projects_recalculate_project_global_rank_update
after update of user_id, goal_id, priority, stage, due_date, completed_at on public.projects
for each statement
execute function public.trigger_recalculate_project_global_rank();

drop trigger if exists projects_recalculate_project_global_rank_delete on public.projects;
create trigger projects_recalculate_project_global_rank_delete
after delete on public.projects
for each statement
execute function public.trigger_recalculate_project_global_rank();

drop trigger if exists goals_recalculate_project_global_rank_update on public.goals;
create trigger goals_recalculate_project_global_rank_update
after update of global_rank on public.goals
for each statement
execute function public.trigger_recalculate_project_global_rank();

select public.recalculate_project_global_rank();

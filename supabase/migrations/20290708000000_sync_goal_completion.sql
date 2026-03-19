-- Sync goal status to active/completed whenever project completion changes.
-- Assumes goal.status only tracks ACTIVE/COMPLETED for this auto-sync path.

create or replace function public.sync_goal_status_after_project_change(p_goal_id uuid)
returns void language plpgsql as $$
declare
  total_projects int;
  completed_projects int;
  release_stage_id bigint := -1;
  target_status text;
begin
  if p_goal_id is null then
    return;
  end if;

  select coalesce(
    (select id from public.project_stage where name = 'RELEASE' limit 1),
    -1
  ) into release_stage_id;

  select count(*) into total_projects
  from public.projects
  where goal_id = p_goal_id;

  if total_projects = 0 then
    -- Do not auto-complete or mutate goals without any projects.
    return;
  end if;

  select count(*) into completed_projects
  from public.projects
  where goal_id = p_goal_id
    and (
      completed_at is not null
      or stage_id = release_stage_id
    );

  if completed_projects = total_projects then
    target_status := 'COMPLETED';
  else
    target_status := 'ACTIVE';
  end if;

  update public.goals
  set status = target_status,
      updated_at = now()
  where id = p_goal_id
    and status is distinct from target_status;
end;
$$;

create or replace function public.trigger_sync_goal_status_for_project()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.goal_id is not null then
      perform public.sync_goal_status_after_project_change(new.goal_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.goal_id is not null then
      perform public.sync_goal_status_after_project_change(old.goal_id);
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if old.goal_id is distinct from new.goal_id then
      if old.goal_id is not null then
        perform public.sync_goal_status_after_project_change(old.goal_id);
      end if;
      if new.goal_id is not null then
        perform public.sync_goal_status_after_project_change(new.goal_id);
      end if;
      return new;
    end if;

    if new.goal_id is not null then
      perform public.sync_goal_status_after_project_change(new.goal_id);
    end if;
    return new;
  end if;

  return new;
end;
$$;

-- Ensure no duplicate triggers exist before creating new ones.
drop trigger if exists trg_projects_goal_status_sync_insert on public.projects;
drop trigger if exists trg_projects_goal_status_sync_delete on public.projects;
drop trigger if exists trg_projects_goal_status_sync_update on public.projects;

create trigger trg_projects_goal_status_sync_insert
  after insert on public.projects
  for each row execute function public.trigger_sync_goal_status_for_project();

create trigger trg_projects_goal_status_sync_delete
  after delete on public.projects
  for each row execute function public.trigger_sync_goal_status_for_project();

create trigger trg_projects_goal_status_sync_update
  after update of completed_at, goal_id on public.projects
  for each row execute function public.trigger_sync_goal_status_for_project();

-- Backfill existing goals based on current project completion state.
with release_stage_id as (
  select coalesce(
    (select id from public.project_stage where name = 'RELEASE' limit 1),
    -1
  ) as stage_id
),
goal_stats as (
  select
    g.id,
    count(p.*) as project_count,
    bool_and(
      p.completed_at is not null
      or p.stage_id = release_stage_id.stage_id
    ) as all_projects_completed
  from public.goals g
  join public.projects p on p.goal_id = g.id
  cross join release_stage_id
  group by g.id, release_stage_id.stage_id
)
update public.goals g
set status = case when gs.all_projects_completed and gs.project_count > 0 then 'COMPLETED' else 'ACTIVE' end,
    updated_at = now()
from goal_stats gs
where g.id = gs.id
  and gs.project_count > 0
  and g.status is distinct from (
    case when gs.all_projects_completed and gs.project_count > 0 then 'COMPLETED' else 'ACTIVE' end
  );

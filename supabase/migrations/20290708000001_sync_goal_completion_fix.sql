-- Extra migration to force corrected goal completion logic into existing databases.
-- Treat a project as complete when completed_at is set or the stage enum is RELEASE.

create or replace function public.sync_goal_status_after_project_change(p_goal_id uuid)
returns void language plpgsql as $$
declare
  total_projects int;
  completed_projects int;
  target_status text;
begin
  if p_goal_id is null then
    return;
  end if;

  select count(*) into total_projects
  from public.projects
  where goal_id = p_goal_id;

  if total_projects = 0 then
    -- Skip goals without projects so we never auto-complete them.
    return;
  end if;

  select count(*) into completed_projects
  from public.projects
  where goal_id = p_goal_id
    and (
      completed_at is not null
      or upper(stage::text) = 'RELEASE'
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
  after update of completed_at, goal_id, stage on public.projects
  for each row execute function public.trigger_sync_goal_status_for_project();

-- Backfill all goals so their status reflects the corrected completion rules.
with goal_stats as (
  select
    g.id,
    count(p.*) as project_count,
    bool_and(
      p.completed_at is not null
      or upper(p.stage::text) = 'RELEASE'
    ) as all_projects_completed
  from public.goals g
  join public.projects p on p.goal_id = g.id
  group by g.id
)
update public.goals g
set status = case
    when gs.all_projects_completed and gs.project_count > 0 then 'COMPLETED'
    else 'ACTIVE'
  end,
  updated_at = now()
from goal_stats gs
where g.id = gs.id
  and gs.project_count > 0
  and g.status is distinct from (
    case
      when gs.all_projects_completed and gs.project_count > 0 then 'COMPLETED'
      else 'ACTIVE'
    end
  );

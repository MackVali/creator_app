-- Normalize goal durable status to ACTIVE / PAUSED / COMPLETED.
-- Keep goals.active as a legacy compatibility flag aligned to status.

update public.goals
set
  status = case
    when upper(trim(coalesce(status, ''))) in ('COMPLETED', 'DONE') then 'COMPLETED'
    when upper(trim(coalesce(status, ''))) in ('PAUSED', 'INACTIVE') then 'PAUSED'
    when upper(trim(coalesce(status, ''))) in ('ACTIVE', 'IN_PROGRESS', 'IN PROGRESS') then 'ACTIVE'
    when active = false then 'PAUSED'
    else 'ACTIVE'
  end,
  active = case
    when upper(trim(coalesce(status, ''))) in ('COMPLETED', 'DONE', 'PAUSED', 'INACTIVE') then false
    when upper(trim(coalesce(status, ''))) in ('ACTIVE', 'IN_PROGRESS', 'IN PROGRESS') then true
    when active = false then false
    else true
  end;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.goals'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format(
      'alter table public.goals drop constraint if exists %I',
      constraint_name
    );
  end loop;
end;
$$;

alter table public.goals
  alter column status set default 'ACTIVE';

alter table public.goals
  add constraint goals_status_check
  check (status in ('ACTIVE', 'PAUSED', 'COMPLETED'));

create or replace function public.sync_goal_status_after_project_change(p_goal_id uuid)
returns void language plpgsql as $$
declare
  total_projects int;
  completed_projects int;
  target_status text;
  current_status text;
begin
  if p_goal_id is null then
    return;
  end if;

  select upper(trim(coalesce(status, '')))
  into current_status
  from public.goals
  where id = p_goal_id;

  if current_status = 'COMPLETED' then
    return;
  end if;

  select count(*) into total_projects
  from public.projects
  where goal_id = p_goal_id;

  if total_projects = 0 then
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
  elsif current_status in ('PAUSED', 'INACTIVE') then
    target_status := 'PAUSED';
  else
    target_status := 'ACTIVE';
  end if;

  update public.goals
  set status = target_status,
      active = (target_status = 'ACTIVE'),
      updated_at = now()
  where id = p_goal_id
    and (
      status is distinct from target_status
      or active is distinct from (target_status = 'ACTIVE')
    );
end;
$$;

create table if not exists public.item_dependencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  dependency_type text not null,
  depends_on_id uuid null,
  not_before_date date null,
  weekdays smallint[] null,
  created_at timestamptz not null default now(),
  constraint item_dependencies_source_type_check
    check (source_type in ('GOAL', 'PROJECT', 'TASK', 'HABIT')),
  constraint item_dependencies_dependency_type_check
    check (dependency_type in ('ITEM', 'DATE', 'WEEKDAY')),
  constraint item_dependencies_payload_shape_check
    check (
      (
        dependency_type = 'ITEM'
        and depends_on_id is not null
        and not_before_date is null
        and weekdays is null
        and depends_on_id <> source_id
      )
      or (
        dependency_type = 'DATE'
        and depends_on_id is null
        and not_before_date is not null
        and weekdays is null
      )
      or (
        dependency_type = 'WEEKDAY'
        and depends_on_id is null
        and not_before_date is null
        and weekdays is not null
        and array_length(weekdays, 1) > 0
        and 0 <= all(weekdays)
        and 6 >= all(weekdays)
      )
    )
);

create index if not exists item_dependencies_user_id_idx
  on public.item_dependencies (user_id);

create index if not exists item_dependencies_source_idx
  on public.item_dependencies (source_type, source_id);

create index if not exists item_dependencies_item_prerequisite_idx
  on public.item_dependencies (source_type, depends_on_id)
  where dependency_type = 'ITEM';

create unique index if not exists item_dependencies_one_date_per_source_idx
  on public.item_dependencies (user_id, source_type, source_id)
  where dependency_type = 'DATE';

create unique index if not exists item_dependencies_one_weekday_per_source_idx
  on public.item_dependencies (user_id, source_type, source_id)
  where dependency_type = 'WEEKDAY';

create or replace function public.item_dependency_source_exists(
  p_user_id uuid,
  p_source_type text,
  p_source_id uuid
)
returns boolean
language plpgsql
stable
as $$
begin
  if p_source_type = 'GOAL' then
    return exists (
      select 1 from public.goals
      where id = p_source_id and user_id = p_user_id
    );
  elsif p_source_type = 'PROJECT' then
    return exists (
      select 1 from public.projects
      where id = p_source_id and user_id = p_user_id
    );
  elsif p_source_type = 'TASK' then
    return exists (
      select 1 from public.tasks
      where id = p_source_id and user_id = p_user_id
    );
  elsif p_source_type = 'HABIT' then
    return exists (
      select 1 from public.habits
      where id = p_source_id and user_id = p_user_id
    );
  end if;

  return false;
end;
$$;

create or replace function public.validate_item_dependency()
returns trigger
language plpgsql
as $$
begin
  if not public.item_dependency_source_exists(NEW.user_id, NEW.source_type, NEW.source_id) then
    raise exception 'Dependency source item does not exist';
  end if;

  if NEW.dependency_type = 'ITEM' then
    if not public.item_dependency_source_exists(NEW.user_id, NEW.source_type, NEW.depends_on_id) then
      raise exception 'Dependency prerequisite item does not exist';
    end if;

    if exists (
      with recursive dependency_walk(source_id, depends_on_id, path) as (
        select
          NEW.source_id,
          NEW.depends_on_id,
          array[NEW.source_id, NEW.depends_on_id]
        union all
        select
          d.source_id,
          d.depends_on_id,
          dependency_walk.path || d.depends_on_id
        from public.item_dependencies d
        join dependency_walk on d.source_id = dependency_walk.depends_on_id
        where d.user_id = NEW.user_id
          and d.source_type = NEW.source_type
          and d.dependency_type = 'ITEM'
          and d.id <> NEW.id
          and d.depends_on_id is not null
          and not d.depends_on_id = any(dependency_walk.path)
      )
      select 1
      from dependency_walk
      where depends_on_id = NEW.source_id
      limit 1
    ) then
      raise exception 'Dependency would create a cycle';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists item_dependencies_validate on public.item_dependencies;
create trigger item_dependencies_validate
  before insert or update on public.item_dependencies
  for each row
  execute function public.validate_item_dependency();

alter table public.item_dependencies enable row level security;

drop policy if exists "item_dependencies_select_own" on public.item_dependencies;
drop policy if exists "item_dependencies_insert_own" on public.item_dependencies;
drop policy if exists "item_dependencies_update_own" on public.item_dependencies;
drop policy if exists "item_dependencies_delete_own" on public.item_dependencies;

create policy "item_dependencies_select_own" on public.item_dependencies
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "item_dependencies_insert_own" on public.item_dependencies
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "item_dependencies_update_own" on public.item_dependencies
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "item_dependencies_delete_own" on public.item_dependencies
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.item_dependencies to authenticated;
grant select, insert, update, delete on public.item_dependencies to service_role;

create or replace function public.cleanup_item_dependencies_for_deleted_item()
returns trigger
language plpgsql
as $$
begin
  delete from public.item_dependencies
  where user_id = OLD.user_id
    and source_type = TG_ARGV[0]
    and (source_id = OLD.id or depends_on_id = OLD.id);

  return OLD;
end;
$$;

drop trigger if exists goals_cleanup_item_dependencies on public.goals;
create trigger goals_cleanup_item_dependencies
  after delete on public.goals
  for each row
  execute function public.cleanup_item_dependencies_for_deleted_item('GOAL');

drop trigger if exists projects_cleanup_item_dependencies on public.projects;
create trigger projects_cleanup_item_dependencies
  after delete on public.projects
  for each row
  execute function public.cleanup_item_dependencies_for_deleted_item('PROJECT');

drop trigger if exists tasks_cleanup_item_dependencies on public.tasks;
create trigger tasks_cleanup_item_dependencies
  after delete on public.tasks
  for each row
  execute function public.cleanup_item_dependencies_for_deleted_item('TASK');

drop trigger if exists habits_cleanup_item_dependencies on public.habits;
create trigger habits_cleanup_item_dependencies
  after delete on public.habits
  for each row
  execute function public.cleanup_item_dependencies_for_deleted_item('HABIT');

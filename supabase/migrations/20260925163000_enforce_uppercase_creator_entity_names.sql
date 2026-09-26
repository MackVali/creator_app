begin;

-- ------------------------------------------------------------
-- Canonical CREATOR entity-name normalization.
-- Goals, Projects, Tasks, Habits and Events are always uppercase.
-- Schedule-instance cached titles are also always uppercase.
-- ------------------------------------------------------------

create or replace function public.uppercase_creator_name()
returns trigger
language plpgsql
as $$
begin
  if new.name is not null then
    new.name := upper(btrim(new.name));
  end if;
  return new;
end;
$$;

create or replace function public.uppercase_creator_event_title()
returns trigger
language plpgsql
as $$
begin
  if new.title is not null then
    new.title := upper(btrim(new.title));
  end if;
  return new;
end;
$$;

create or replace function public.uppercase_schedule_instance_titles()
returns trigger
language plpgsql
as $$
begin
  if new.event_name is not null then
    new.event_name := upper(btrim(new.event_name));
  end if;

  if new.project_name is not null then
    new.project_name := upper(btrim(new.project_name));
  end if;

  return new;
end;
$$;

drop trigger if exists goals_uppercase_name on public.goals;
create trigger goals_uppercase_name
before insert or update of name
on public.goals
for each row
execute function public.uppercase_creator_name();

drop trigger if exists projects_uppercase_name on public.projects;
create trigger projects_uppercase_name
before insert or update of name
on public.projects
for each row
execute function public.uppercase_creator_name();

drop trigger if exists tasks_uppercase_name on public.tasks;
create trigger tasks_uppercase_name
before insert or update of name
on public.tasks
for each row
execute function public.uppercase_creator_name();

drop trigger if exists habits_uppercase_name on public.habits;
create trigger habits_uppercase_name
before insert or update of name
on public.habits
for each row
execute function public.uppercase_creator_name();

drop trigger if exists events_uppercase_title on public.events;
create trigger events_uppercase_title
before insert or update of title
on public.events
for each row
execute function public.uppercase_creator_event_title();

drop trigger if exists schedule_instances_uppercase_titles
on public.schedule_instances;

create trigger schedule_instances_uppercase_titles
before insert or update of event_name, project_name
on public.schedule_instances
for each row
execute function public.uppercase_schedule_instance_titles();

-- ------------------------------------------------------------
-- Backfill existing rows.
-- ------------------------------------------------------------

update public.goals
set name = upper(btrim(name))
where name is not null
  and name is distinct from upper(btrim(name));

update public.projects
set name = upper(btrim(name))
where name is not null
  and name is distinct from upper(btrim(name));

update public.tasks
set name = upper(btrim(name))
where name is not null
  and name is distinct from upper(btrim(name));

update public.habits
set name = upper(btrim(name))
where name is not null
  and name is distinct from upper(btrim(name));

update public.events
set title = upper(btrim(title))
where title is not null
  and title is distinct from upper(btrim(title));

update public.schedule_instances
set
  event_name =
    case
      when event_name is null then null
      else upper(btrim(event_name))
    end,
  project_name =
    case
      when project_name is null then null
      else upper(btrim(project_name))
    end
where
  (
    event_name is not null
    and event_name is distinct from upper(btrim(event_name))
  )
  or
  (
    project_name is not null
    and project_name is distinct from upper(btrim(project_name))
  );

commit;

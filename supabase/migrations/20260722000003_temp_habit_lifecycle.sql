begin;

alter table public.habits
  add column if not exists goal_id uuid,
  add column if not exists completion_target integer,
  add column if not exists finished_at timestamptz;

do $$
begin
  alter table public.habits
    add constraint habits_goal_id_fkey
    foreign key (goal_id)
    references public.goals (id)
    on delete set null;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.habits
    add constraint habits_completion_target_positive
    check (completion_target is null or completion_target > 0);
exception
  when duplicate_object then null;
end
$$;

alter table public.habits drop constraint if exists habits_temp_goal_target_check;
alter table public.habits add constraint habits_temp_goal_target_check check (
  habit_type <> 'TEMP'
  or (goal_id is not null and completion_target is not null and completion_target > 0)
) not valid;

update public.habits h
set finished_at = coalesce(h.finished_at, now())
where h.habit_type = 'TEMP'
  and h.completion_target > 0
  and (select count(*) from public.habit_completion_days d where d.habit_id = h.id) >= h.completion_target;

create or replace function public.set_habit_completion_day(
  p_habit_id uuid,
  p_completion_day date,
  p_completed_at timestamptz,
  p_is_complete boolean
)
returns table(completion_count bigint, completion_target integer, finished_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_habit public.habits%rowtype;
  v_count bigint;
  v_finished_at timestamptz;
begin
  select * into v_habit from public.habits
  where id = p_habit_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Habit not found'; end if;

  if p_is_complete then
    insert into public.habit_completion_days (habit_id, user_id, completion_day, completed_at)
    values (p_habit_id, auth.uid(), p_completion_day, p_completed_at)
    on conflict (habit_id, completion_day) do update set completed_at = excluded.completed_at;
  else
    delete from public.habit_completion_days
    where habit_id = p_habit_id and user_id = auth.uid() and completion_day = p_completion_day;
  end if;

  select count(*) into v_count from public.habit_completion_days where habit_id = p_habit_id;

  if p_is_complete then
    update public.habits set next_due_override = null where id = p_habit_id;
  end if;

  if v_habit.habit_type = 'TEMP' then
    v_finished_at := case
      when v_habit.completion_target is not null and v_count >= v_habit.completion_target
        then coalesce(v_habit.finished_at, p_completed_at)
      else null
    end;
    update public.habits
    set finished_at = v_finished_at,
        next_due_override = case when v_finished_at is not null then null else next_due_override end
    where id = p_habit_id;

    if v_finished_at is not null then
      update public.schedule_instances
      set status = 'canceled', canceled_reason = 'temp_habit_finished', updated_at = now()
      where user_id = auth.uid() and source_type = 'HABIT' and source_id = p_habit_id
        and status = 'scheduled' and start_utc >= now();
    end if;
  else
    v_finished_at := v_habit.finished_at;
  end if;

  return query select v_count, v_habit.completion_target, v_finished_at;
end;
$$;

revoke execute on function public.set_habit_completion_day(uuid, date, timestamptz, boolean) from public;
revoke execute on function public.set_habit_completion_day(uuid, date, timestamptz, boolean) from anon;
grant execute on function public.set_habit_completion_day(uuid, date, timestamptz, boolean) to authenticated;

create or replace function public.reconcile_temp_habit_from_completion_days()
returns trigger language plpgsql set search_path = public as $$
declare
  v_habit public.habits%rowtype;
  v_habit_id uuid;
  v_count bigint;
  v_completed_at timestamptz;
  v_finished_at timestamptz;
begin
  if tg_op = 'DELETE' then
    v_habit_id := old.habit_id;
    v_completed_at := old.completed_at;
  else
    v_habit_id := new.habit_id;
    v_completed_at := new.completed_at;
  end if;

  select * into v_habit from public.habits
  where id = v_habit_id and habit_type = 'TEMP'
  for update;
  if not found then return null; end if;

  select count(*) into v_count from public.habit_completion_days where habit_id = v_habit_id;
  v_finished_at := case
    when v_habit.completion_target is not null and v_count >= v_habit.completion_target
      then coalesce(v_habit.finished_at, v_completed_at, now())
    else null
  end;

  update public.habits
  set finished_at = v_finished_at,
      next_due_override = case when v_finished_at is not null then null else next_due_override end
  where id = v_habit_id
    and (
      finished_at is distinct from v_finished_at
      or (v_finished_at is not null and next_due_override is not null)
    );

  return null;
end;
$$;

drop trigger if exists reconcile_temp_habit_completion_days_lifecycle on public.habit_completion_days;
create trigger reconcile_temp_habit_completion_days_lifecycle
after insert or update or delete on public.habit_completion_days
for each row execute function public.reconcile_temp_habit_from_completion_days();

create or replace function public.reconcile_temp_habit_on_source_write()
returns trigger language plpgsql set search_path = public as $$
declare v_count bigint;
begin
  if new.habit_type <> 'TEMP' then
    new.goal_id := null;
    new.completion_target := null;
    new.finished_at := null;
    return new;
  end if;
  select count(*) into v_count from public.habit_completion_days where habit_id = new.id;
  if new.completion_target is not null and v_count >= new.completion_target then
    new.finished_at := case
      when tg_op = 'UPDATE' then coalesce(old.finished_at, now())
      else now()
    end;
  else
    new.finished_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reconcile_temp_habit_source_write on public.habits;
create trigger reconcile_temp_habit_source_write
before insert or update of habit_type, goal_id, completion_target on public.habits
for each row execute function public.reconcile_temp_habit_on_source_write();

create or replace function public.detach_temp_habits_before_goal_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.habits
  set habit_type = 'HABIT',
      goal_id = null,
      completion_target = null,
      finished_at = null
  where goal_id = old.id and habit_type = 'TEMP';

  return old;
end;
$$;

drop trigger if exists detach_temp_habits_before_goal_delete on public.goals;
create trigger detach_temp_habits_before_goal_delete
before delete on public.goals
for each row execute function public.detach_temp_habits_before_goal_delete();

create or replace function public.cleanup_finished_temp_habit_schedule()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.habit_type = 'TEMP' and new.finished_at is not null then
    update public.schedule_instances
    set status = 'canceled', canceled_reason = 'temp_habit_finished', updated_at = now()
    where user_id = new.user_id and source_type = 'HABIT' and source_id = new.id
      and status = 'scheduled' and start_utc >= now();
  end if;
  return new;
end;
$$;

drop trigger if exists cleanup_finished_temp_habit_schedule on public.habits;
create trigger cleanup_finished_temp_habit_schedule
after insert or update of habit_type, completion_target, finished_at on public.habits
for each row execute function public.cleanup_finished_temp_habit_schedule();

drop trigger if exists mark_schedule_instances_on_habit_update on public.habits;
create trigger mark_schedule_instances_on_habit_update after update on public.habits
for each row when (
  old.name is distinct from new.name or old.habit_type is distinct from new.habit_type
  or old.recurrence is distinct from new.recurrence or old.recurrence_days is distinct from new.recurrence_days
  or old.duration_minutes is distinct from new.duration_minutes or old.energy is distinct from new.energy
  or old.window_id is distinct from new.window_id or old.location_context_id is distinct from new.location_context_id
  or old.skill_id is distinct from new.skill_id
  or old.fixed_start_local is distinct from new.fixed_start_local or old.fixed_end_local is distinct from new.fixed_end_local
  or old.fixed_timezone is distinct from new.fixed_timezone or old.daylight_preference is distinct from new.daylight_preference
  or old.window_edge_preference is distinct from new.window_edge_preference or old.anchor_type is distinct from new.anchor_type
  or old.anchor_value is distinct from new.anchor_value or old.anchor_start_date is distinct from new.anchor_start_date
)
execute function public.mark_schedule_instances_missed('HABIT');

commit;

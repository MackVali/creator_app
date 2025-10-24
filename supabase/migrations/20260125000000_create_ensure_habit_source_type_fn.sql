-- Create helper to ensure HABIT source type exists for schedule instances
create or replace function public.ensure_schedule_instance_habit_type()
returns boolean
language plpgsql
security definer
as $$
declare
  already_exists boolean;
begin
  select exists(
    select 1
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    where t.typname = 'schedule_instance_source_type'
      and e.enumlabel = 'HABIT'
  )
  into already_exists;

  if already_exists then
    return false;
  end if;

  begin
    execute 'alter type public.schedule_instance_source_type add value ''HABIT''';
  exception when duplicate_object then
    -- Value was added concurrently
    null;
  end;

  return true;
end;
$$;

grant execute on function public.ensure_schedule_instance_habit_type() to authenticated;
grant execute on function public.ensure_schedule_instance_habit_type() to service_role;
grant execute on function public.ensure_schedule_instance_habit_type() to anon;

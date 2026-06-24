do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'schedule_instance_placement_source'
      and n.nspname = 'public'
  ) then
    create type public.schedule_instance_placement_source as enum ('scheduler', 'manual');
  end if;
end
$$;

alter table public.schedule_instances
  add column if not exists placement_source public.schedule_instance_placement_source not null default 'scheduler';

comment on column public.schedule_instances.placement_source is
  'Origin of the exact schedule placement: scheduler-created or user-manual.';

update public.schedule_instances
set placement_source = 'manual'
where locked = true
  and source_type = 'PROJECT'
  and window_id is null
  and day_type_time_block_id is null
  and time_block_id is null
  and overlay_window_id is null;

-- Add a locked flag so fixed-time project instances remain anchored
alter table public.schedule_instances
  add column if not exists locked boolean not null default false;

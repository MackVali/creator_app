-- Add missing canceled_reason column referenced by scheduler overlap cleanup
alter table public.schedule_instances
  add column if not exists canceled_reason text;

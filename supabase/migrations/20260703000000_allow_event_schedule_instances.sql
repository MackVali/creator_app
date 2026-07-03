-- Allow standalone scheduled Events to be persisted in schedule_instances.
-- This matches the existing manual Event save path used by the schedule UI.

ALTER TABLE public.schedule_instances
  DROP CONSTRAINT IF EXISTS schedule_instances_source_type_check;

ALTER TABLE public.schedule_instances
  ADD CONSTRAINT schedule_instances_source_type_check
  CHECK (source_type IN ('PROJECT', 'TASK', 'HABIT', 'EVENT'));

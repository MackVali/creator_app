-- Remove the legacy foreign key from schedule_instances.window_id -> windows.id
-- The window_id column remains for backwards compatibility, but day-type scheduling now
-- relies on day_type_time_block_id/time_block_id (and may leave window_id null).

ALTER TABLE public.schedule_instances
DROP CONSTRAINT IF EXISTS schedule_instances_window_id_fkey;

COMMENT ON COLUMN public.schedule_instances.window_id IS
  'Legacy reference to public.windows(id); left null for day-type scheduling.';

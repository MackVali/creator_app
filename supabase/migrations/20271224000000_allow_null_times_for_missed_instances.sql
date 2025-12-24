-- Allow NULL start_utc/end_utc for missed PROJECT instances
-- Safety check: Verify current constraints and null counts before migration
-- SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.schedule_instances'::regclass
--   AND conname LIKE '%start%' OR conname LIKE '%end%';
--
-- SELECT status, COUNT(*) as count,
--        COUNT(*) FILTER (WHERE start_utc IS NULL) as null_start_count,
--        COUNT(*) FILTER (WHERE end_utc IS NULL) as null_end_count
-- FROM schedule_instances
-- GROUP BY status;

-- Drop NOT NULL constraints on start_utc and end_utc
ALTER TABLE public.schedule_instances
  ALTER COLUMN start_utc DROP NOT NULL;

ALTER TABLE public.schedule_instances
  ALTER COLUMN end_utc DROP NOT NULL;

-- Update the CHECK constraint to handle NULL values
-- Drop the existing constraint
ALTER TABLE public.schedule_instances
  DROP CONSTRAINT IF EXISTS schedule_instances_start_before_end;

-- Add the updated constraint that allows NULL
ALTER TABLE public.schedule_instances
  ADD CONSTRAINT schedule_instances_start_before_end
  CHECK ((start_utc IS NULL AND end_utc IS NULL) OR (start_utc IS NOT NULL AND end_utc IS NOT NULL AND start_utc < end_utc));

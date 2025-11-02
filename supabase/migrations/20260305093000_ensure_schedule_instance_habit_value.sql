-- Ensure the schedule_instance_source_type enum includes the HABIT discriminator
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'schedule_instance_source_type'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.schedule_instance_source_type AS ENUM ('PROJECT', 'TASK');
  END IF;
END
$$;

ALTER TYPE public.schedule_instance_source_type
ADD VALUE IF NOT EXISTS 'HABIT';

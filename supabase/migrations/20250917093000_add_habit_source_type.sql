-- Ensure HABIT variant exists on schedule_instance_source_type enum for habit schedule instances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'schedule_instance_source_type'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.schedule_instance_source_type AS ENUM ('PROJECT', 'TASK', 'HABIT');
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'schedule_instance_source_type'
      AND n.nspname = 'public'
      AND e.enumlabel = 'HABIT'
  ) THEN
    ALTER TYPE public.schedule_instance_source_type
    ADD VALUE 'HABIT';
  END IF;
END
$$;

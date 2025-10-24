-- Add HABIT source type to schedule instances so habit placements can persist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'schedule_instance_source_type'
      AND e.enumlabel = 'HABIT'
  ) THEN
    ALTER TYPE public.schedule_instance_source_type ADD VALUE 'HABIT';
  END IF;
END
$$;

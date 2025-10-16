-- Ensure the habit_type enum includes the SYNC label so existing ASYNC
-- records can be migrated without errors.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'habit_type_enum'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        WHERE e.enumlabel = 'SYNC'
          AND e.enumtypid = 'public.habit_type_enum'::regtype
    ) THEN
        ALTER TYPE public.habit_type_enum ADD VALUE 'SYNC';
    END IF;
END
$$;

-- Normalize legacy ASYNC habits to use the SYNC habit type.
UPDATE public.habits
SET habit_type = 'SYNC'
WHERE habit_type = 'ASYNC';

-- Keep the lookup table in sync by renaming any user-facing labels.
UPDATE public.habit_types
SET name = 'SYNC'
WHERE name ILIKE 'ASYNC';

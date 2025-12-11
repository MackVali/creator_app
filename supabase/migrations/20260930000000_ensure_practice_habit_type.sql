-- Ensure the PRACTICE habit type enum exists in environments where the earlier
-- migration might not have run yet.

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
        WHERE e.enumlabel = 'PRACTICE'
          AND e.enumtypid = 'public.habit_type_enum'::regtype
    ) THEN
        ALTER TYPE public.habit_type_enum ADD VALUE 'PRACTICE';
    END IF;
END
$$;

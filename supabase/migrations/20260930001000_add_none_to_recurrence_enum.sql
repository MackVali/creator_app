-- Allow habits to explicitly store a "none" recurrence while keeping the column non-null.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'recurrence_enum'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        WHERE e.enumlabel = 'none'
          AND e.enumtypid = 'public.recurrence_enum'::regtype
    ) THEN
        ALTER TYPE public.recurrence_enum ADD VALUE 'none';
    END IF;
END
$$;

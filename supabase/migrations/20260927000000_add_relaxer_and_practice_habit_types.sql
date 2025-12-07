-- Add RELAXER and PRACTICE habit type enums so new habits can opt into them

-- Ensure RELAXER exists on habit_type_enum
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
        WHERE e.enumlabel = 'RELAXER'
          AND e.enumtypid = 'public.habit_type_enum'::regtype
    ) THEN
        ALTER TYPE public.habit_type_enum ADD VALUE 'RELAXER';
    END IF;
END
$$;

-- Ensure PRACTICE exists on habit_type_enum
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

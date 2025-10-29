-- Ensure habits support completion targets for recurring executions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'habits'
          AND column_name = 'completion_target'
    ) THEN
        ALTER TABLE public.habits
            ADD COLUMN completion_target integer;
    END IF;
END
$$;

-- Require positive completion targets when provided
DO $$
BEGIN
    ALTER TABLE public.habits
        ADD CONSTRAINT habits_completion_target_positive
        CHECK (completion_target IS NULL OR completion_target > 0);
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END
$$;

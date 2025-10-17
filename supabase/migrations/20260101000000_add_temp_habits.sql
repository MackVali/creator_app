-- Add Temp habit support with goal linkage and completion tracking

-- Ensure the habit_type enum includes the TEMP label
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
        WHERE e.enumlabel = 'TEMP'
          AND e.enumtypid = 'public.habit_type_enum'::regtype
    ) THEN
        ALTER TYPE public.habit_type_enum ADD VALUE 'TEMP';
    END IF;
END $$;

-- Add goal linkage and completion tracking columns
ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS goal_id uuid,
    ADD COLUMN IF NOT EXISTS temp_completion_target integer,
    ADD COLUMN IF NOT EXISTS temp_completion_count integer DEFAULT 0;

-- Normalize null completion counts to zero for consistency
UPDATE public.habits
SET temp_completion_count = 0
WHERE temp_completion_count IS NULL;

ALTER TABLE public.habits
    ALTER COLUMN temp_completion_count SET DEFAULT 0;

-- Ensure the goal reference stays in sync with user goals
ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_goal_id_fkey;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_goal_id_fkey
        FOREIGN KEY (goal_id)
        REFERENCES public.goals(id)
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS habits_goal_id_idx
    ON public.habits (goal_id);

-- Guard against invalid completion targets
ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_temp_completion_positive;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_temp_completion_positive
        CHECK (temp_completion_target IS NULL OR temp_completion_target >= 1);

ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_temp_completion_count_nonnegative;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_temp_completion_count_nonnegative
        CHECK (temp_completion_count IS NULL OR temp_completion_count >= 0);

ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_temp_require_goal;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_temp_require_goal
        CHECK (
            habit_type <> 'TEMP'
            OR (goal_id IS NOT NULL AND temp_completion_target IS NOT NULL)
        );

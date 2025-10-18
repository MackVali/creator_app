-- Add TEMP habit type and support temporary habit metadata

-- Ensure the TEMP enum label exists for habit_type_enum
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
END
$$;

-- Add goal relationship and completion target tracking for habits
ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS goal_id uuid,
    ADD COLUMN IF NOT EXISTS completion_target integer;

-- Link temp habits to goals
DO $$
BEGIN
    ALTER TABLE public.habits
        ADD CONSTRAINT habits_goal_id_fkey
        FOREIGN KEY (goal_id)
        REFERENCES public.goals (id)
        ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Require TEMP habits to be linked to a goal
DO $$
BEGIN
    ALTER TABLE public.habits
        ADD CONSTRAINT habits_temp_goal_required
        CHECK (habit_type <> 'TEMP'::habit_type_enum OR goal_id IS NOT NULL);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Require TEMP habits to define a completion target
DO $$
BEGIN
    ALTER TABLE public.habits
        ADD CONSTRAINT habits_temp_completion_required
        CHECK (
            habit_type <> 'TEMP'::habit_type_enum
            OR completion_target IS NOT NULL
        );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Ensure completion targets are positive when provided
DO $$
BEGIN
    ALTER TABLE public.habits
        ADD CONSTRAINT habits_completion_target_positive
        CHECK (completion_target IS NULL OR completion_target > 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

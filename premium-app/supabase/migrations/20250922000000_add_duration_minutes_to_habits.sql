-- Add duration_minutes column to habits
ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS duration_minutes integer;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'habits_duration_minutes_positive'
    ) THEN
        ALTER TABLE public.habits
            ADD CONSTRAINT habits_duration_minutes_positive
            CHECK (duration_minutes IS NULL OR duration_minutes > 0);
    END IF;
END $$;

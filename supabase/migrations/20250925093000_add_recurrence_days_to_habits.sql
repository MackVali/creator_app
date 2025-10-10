-- Allow habits to store selected weekdays for custom cadences
ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS recurrence_days text[];

CREATE INDEX IF NOT EXISTS habits_recurrence_days_gin_idx
    ON public.habits
    USING gin (recurrence_days);

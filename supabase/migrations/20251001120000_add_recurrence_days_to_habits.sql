-- Add recurrence_days column to habits for selecting specific weekdays
ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS recurrence_days integer[];

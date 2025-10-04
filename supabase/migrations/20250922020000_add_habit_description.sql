-- Add description column to habits
ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS description text;

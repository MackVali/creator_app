-- Ensure habits track their duration in minutes
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS duration_minutes integer
  CHECK (
    duration_minutes IS NULL
    OR duration_minutes > 0
  );

-- Backfill any legacy rows without a duration to a sensible default
UPDATE public.habits
SET duration_minutes = 30
WHERE duration_minutes IS NULL;

-- Add recurrence mode and anchor configuration for habits

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'habit_recurrence_mode_enum'
  ) THEN
    CREATE TYPE habit_recurrence_mode_enum AS ENUM ('INTERVAL', 'ANCHORED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'habit_anchor_type_enum'
  ) THEN
    CREATE TYPE habit_anchor_type_enum AS ENUM ('DATE', 'DAY');
  END IF;
END
$$;

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS recurrence_mode habit_recurrence_mode_enum NOT NULL DEFAULT 'INTERVAL';

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS anchor_type habit_anchor_type_enum;

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS anchor_value text;

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS anchor_start_date date;

BEGIN;

-- Ensure helper function exists for updated_at management
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

-- Add missing optional columns without failing if they already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'habits'
      AND column_name = 'description'
  ) THEN
    ALTER TABLE public.habits
      ADD COLUMN description text;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'habits'
      AND column_name = 'duration_minutes'
  ) THEN
    ALTER TABLE public.habits
      ADD COLUMN duration_minutes integer;
  END IF;
END
$$;

-- Remove any legacy duration values that would violate the positive duration check
UPDATE public.habits
SET duration_minutes = NULL
WHERE duration_minutes IS NOT NULL
  AND duration_minutes <= 0;

-- Ensure created_at and updated_at columns default to UTC now
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'habits'
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.habits
      ALTER COLUMN created_at SET DEFAULT timezone('utc', now());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'habits'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.habits
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT timezone('utc', now());
  ELSE
    ALTER TABLE public.habits
      ALTER COLUMN updated_at SET DEFAULT timezone('utc', now());
  END IF;
END
$$;

-- Backfill and enforce user_id integrity
DELETE FROM public.habits
WHERE user_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'habits'
      AND column_name = 'user_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.habits
      ALTER COLUMN user_id SET NOT NULL;
  END IF;
END
$$;

ALTER TABLE public.habits
  DROP CONSTRAINT IF EXISTS habits_user_fk;

ALTER TABLE public.habits
  ADD CONSTRAINT habits_user_fk FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE;

-- Ensure optional window relationship is present and valid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'habits'
      AND column_name = 'window_id'
  ) THEN
    ALTER TABLE public.habits
      ADD COLUMN window_id uuid;
  END IF;
END
$$;

ALTER TABLE public.habits
  DROP CONSTRAINT IF EXISTS habits_window_id_fkey;

ALTER TABLE public.habits
  ADD CONSTRAINT habits_window_id_fkey FOREIGN KEY (window_id)
    REFERENCES public.windows(id) ON DELETE SET NULL;

-- Reapply duration guardrail
ALTER TABLE public.habits
  DROP CONSTRAINT IF EXISTS habits_duration_positive;

ALTER TABLE public.habits
  ADD CONSTRAINT habits_duration_positive
    CHECK (duration_minutes IS NULL OR duration_minutes > 0);

-- Keep supporting indexes and trigger in place
CREATE INDEX IF NOT EXISTS habits_user_updated_idx
  ON public.habits (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS habits_window_id_idx
  ON public.habits (window_id);

DROP TRIGGER IF EXISTS habits_set_updated_at ON public.habits;

CREATE TRIGGER habits_set_updated_at
  BEFORE UPDATE ON public.habits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Make sure enum usage and table privileges cover anon clients
GRANT USAGE ON TYPE public.habit_type_enum TO anon, authenticated, service_role;
GRANT USAGE ON TYPE public.recurrence_enum TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.habits TO anon, authenticated;

COMMIT;

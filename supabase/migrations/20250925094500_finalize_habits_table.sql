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

-- Ensure a dedicated habit name column exists and is enforced
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'habits'
      AND column_name = 'name'
  ) THEN
    ALTER TABLE public.habits
      ADD COLUMN name text;
  END IF;
END
$$;

-- Backfill names from legacy Title column when available
DO $$
DECLARE
  has_title boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'habits'
      AND column_name = 'Title'
  ) INTO has_title;

  IF has_title THEN
    UPDATE public.habits
    SET name = COALESCE(name, NULLIF("Title", '')::text)
    WHERE name IS NULL
       OR btrim(name) = '';

    ALTER TABLE public.habits
      DROP COLUMN "Title";
  END IF;
END
$$;

-- Fill any remaining blank names with a placeholder and enforce NOT NULL
UPDATE public.habits
SET name = 'Untitled habit'
WHERE name IS NULL
   OR btrim(name) = '';

ALTER TABLE public.habits
  ALTER COLUMN name SET NOT NULL;

-- Ensure optional columns exist without failing if they already do
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
  ELSE
    ALTER TABLE public.habits
      ALTER COLUMN duration_minutes TYPE integer
      USING CASE
        WHEN duration_minutes IS NULL THEN NULL::integer
        WHEN duration_minutes::text ~ '^\\d+$' THEN duration_minutes::integer
        ELSE NULL::integer
      END;
  END IF;
END
$$;

-- Remove any legacy duration values that would violate the positive duration check
UPDATE public.habits
SET duration_minutes = NULL
WHERE duration_minutes IS NOT NULL
  AND duration_minutes <= 0;

-- Ensure habit type column is present and normalized to the enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'habits'
      AND column_name = 'habit_type'
  ) THEN
    ALTER TABLE public.habits
      ADD COLUMN habit_type public.habit_type_enum;
  END IF;

  ALTER TABLE public.habits
    ALTER COLUMN habit_type TYPE public.habit_type_enum
    USING CASE
      WHEN habit_type IS NULL THEN 'HABIT'::public.habit_type_enum
      WHEN upper(habit_type::text) IN ('HABIT', 'CHORE', 'ASYNC') THEN upper(habit_type::text)::public.habit_type_enum
      ELSE 'HABIT'::public.habit_type_enum
    END,
    ALTER COLUMN habit_type SET DEFAULT 'HABIT'::public.habit_type_enum,
    ALTER COLUMN habit_type SET NOT NULL;
END
$$;

-- Ensure recurrence column lines up with the enum but remains optional
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'habits'
      AND column_name = 'recurrence'
  ) THEN
    ALTER TABLE public.habits
      ADD COLUMN recurrence public.recurrence_enum;
  END IF;

  ALTER TABLE public.habits
    ALTER COLUMN recurrence TYPE public.recurrence_enum
    USING CASE
      WHEN recurrence IS NULL THEN NULL::public.recurrence_enum
      WHEN lower(recurrence::text) IN (
        'daily',
        'weekly',
        'bi-weekly',
        'monthly',
        'bi-monthly',
        'yearly',
        'every x days'
      ) THEN lower(recurrence::text)::public.recurrence_enum
      ELSE NULL::public.recurrence_enum
    END;
END
$$;

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
    UPDATE public.habits
    SET created_at = timezone('utc', now())
    WHERE created_at IS NULL;

    ALTER TABLE public.habits
      ALTER COLUMN created_at SET DEFAULT timezone('utc', now()),
      ALTER COLUMN created_at SET NOT NULL;
  ELSE
    ALTER TABLE public.habits
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT timezone('utc', now());
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
    UPDATE public.habits
    SET updated_at = timezone('utc', now())
    WHERE updated_at IS NULL;

    ALTER TABLE public.habits
      ALTER COLUMN updated_at SET DEFAULT timezone('utc', now()),
      ALTER COLUMN updated_at SET NOT NULL;
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

-- Ensure the primary key continues to auto-generate
ALTER TABLE public.habits
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

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

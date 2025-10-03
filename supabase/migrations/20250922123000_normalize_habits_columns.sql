-- Normalize habit metadata columns to prevent insert failures
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'habits'
      AND column_name = 'habit_type'
  ) THEN
    ALTER TABLE public.habits
      ALTER COLUMN habit_type TYPE public.habit_type_enum
      USING CASE
        WHEN habit_type IS NULL THEN 'HABIT'::public.habit_type_enum
        WHEN upper(habit_type::text) IN ('HABIT', 'CHORE', 'ASYNC') THEN upper(habit_type::text)::public.habit_type_enum
        ELSE 'HABIT'::public.habit_type_enum
      END;

    ALTER TABLE public.habits
      ALTER COLUMN habit_type SET DEFAULT 'HABIT'::public.habit_type_enum,
      ALTER COLUMN habit_type SET NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'habits'
      AND column_name = 'recurrence'
  ) THEN
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
  END IF;
END
$$;

-- Ensure duration validation cannot be bypassed with zero or negative values
ALTER TABLE public.habits
  DROP CONSTRAINT IF EXISTS habits_duration_positive,
  ADD CONSTRAINT habits_duration_positive
    CHECK (duration_minutes IS NULL OR duration_minutes > 0);

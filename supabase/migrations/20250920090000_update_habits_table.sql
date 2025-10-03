-- Align habits table with application expectations and grant write access

-- Ensure supporting enum types exist
CREATE TYPE IF NOT EXISTS public.habit_type_enum AS ENUM ('HABIT', 'CHORE', 'ASYNC');
CREATE TYPE IF NOT EXISTS public.recurrence_enum AS ENUM (
  'daily',
  'weekly',
  'bi-weekly',
  'monthly',
  'bi-monthly',
  'yearly',
  'every x days'
);

-- Ensure we have a helper function for updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

-- Bring habits table columns up to date
ALTER TABLE public.habits
  DROP COLUMN IF EXISTS "Title",
  DROP COLUMN IF EXISTS type_id,
  ALTER COLUMN user_id SET NOT NULL,
  ADD COLUMN IF NOT EXISTS name text NOT NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS habit_type public.habit_type_enum NOT NULL DEFAULT 'HABIT',
  ADD COLUMN IF NOT EXISTS recurrence public.recurrence_enum,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS window_id uuid REFERENCES public.windows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  ADD CONSTRAINT IF NOT EXISTS habits_user_fk FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enforce positive durations when provided
ALTER TABLE public.habits
  ADD CONSTRAINT IF NOT EXISTS habits_duration_positive
    CHECK (duration_minutes IS NULL OR duration_minutes > 0);

-- Indexes for performant access patterns
CREATE INDEX IF NOT EXISTS habits_user_updated_idx
  ON public.habits (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS habits_window_id_idx
  ON public.habits (window_id);

-- Updated-at trigger
DROP TRIGGER IF EXISTS habits_set_updated_at ON public.habits;
CREATE TRIGGER habits_set_updated_at
  BEFORE UPDATE ON public.habits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Row level security and policies
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS habits_select_own
  ON public.habits
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS habits_insert_own
  ON public.habits
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS habits_update_own
  ON public.habits
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS habits_delete_own
  ON public.habits
  FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.habits TO authenticated;

-- Ensure monuments have standard name and emoji columns and goals reference them
ALTER TABLE public.monuments
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS emoji text;

-- Backfill name from existing Title column if needed
UPDATE public.monuments
SET name = COALESCE(name, "Title")
WHERE name IS NULL AND "Title" IS NOT NULL;

-- Ensure goals.monument_id is nullable and has a foreign key
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS monument_id uuid;

ALTER TABLE public.goals
  ALTER COLUMN monument_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'goals_monument_id_fkey'
  ) THEN
    ALTER TABLE public.goals
      ADD CONSTRAINT goals_monument_id_fkey
      FOREIGN KEY (monument_id)
      REFERENCES public.monuments(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS and guarded policies
ALTER TABLE public.monuments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'monuments'
      AND policyname = 'monuments_select_own'
  ) THEN
    CREATE POLICY monuments_select_own ON public.monuments
      FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'monuments'
      AND policyname = 'monuments_insert_own'
  ) THEN
    CREATE POLICY monuments_insert_own ON public.monuments
      FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'monuments'
      AND policyname = 'monuments_update_own'
  ) THEN
    CREATE POLICY monuments_update_own ON public.monuments
      FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'monuments'
      AND policyname = 'monuments_delete_own'
  ) THEN
    CREATE POLICY monuments_delete_own ON public.monuments
      FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'goals'
      AND policyname = 'goals_select_own'
  ) THEN
    CREATE POLICY goals_select_own ON public.goals
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_goals_user_monument
  ON public.goals(user_id, monument_id);

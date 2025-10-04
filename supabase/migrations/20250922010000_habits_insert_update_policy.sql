-- Ensure authenticated users can insert and update their own habits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'habits'
      AND policyname = 'habits_insert_own'
  ) THEN
    CREATE POLICY habits_insert_own
      ON public.habits
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'habits'
      AND policyname = 'habits_update_own'
  ) THEN
    CREATE POLICY habits_update_own
      ON public.habits
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END
$$;

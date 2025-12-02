-- Allow authenticated users to delete their own habits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'habits'
      AND policyname = 'habits_delete_own'
  ) THEN
    CREATE POLICY habits_delete_own
      ON public.habits
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END
$$;

-- Ensure habit policies allow authenticated Supabase clients to write
BEGIN;

ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

-- Recreate policies without role restrictions so JWT-authenticated anon connections can use them
DROP POLICY IF EXISTS habits_select_own ON public.habits;
DROP POLICY IF EXISTS "habits_select_own" ON public.habits;
CREATE POLICY habits_select_own
  ON public.habits
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS habits_insert_own ON public.habits;
CREATE POLICY habits_insert_own
  ON public.habits
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS habits_update_own ON public.habits;
CREATE POLICY habits_update_own
  ON public.habits
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS habits_delete_own ON public.habits;
CREATE POLICY habits_delete_own
  ON public.habits
  FOR DELETE
  USING (auth.uid() = user_id);

-- Make sure both anon (JWT) and authenticated roles retain privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits TO anon, authenticated;

COMMIT;

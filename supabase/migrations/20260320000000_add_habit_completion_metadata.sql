-- Track the most recent completion timestamp and streak metadata on habits
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS last_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_streak_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak_days integer NOT NULL DEFAULT 0;

-- Persist one row per completed day so streaks survive schedule cleanup
CREATE TABLE IF NOT EXISTS public.habit_completion_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES public.habits (id) ON DELETE CASCADE,
  completion_day date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT habit_completion_days_unique UNIQUE (habit_id, completion_day)
);

CREATE INDEX IF NOT EXISTS habit_completion_days_user_idx
  ON public.habit_completion_days (user_id);
CREATE INDEX IF NOT EXISTS habit_completion_days_habit_idx
  ON public.habit_completion_days (habit_id, completion_day DESC);

ALTER TABLE public.habit_completion_days ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'habit_completion_days'
      AND policyname = 'habit_completion_days_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY "habit_completion_days_select_own" ON public.habit_completion_days FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'habit_completion_days'
      AND policyname = 'habit_completion_days_insert_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "habit_completion_days_insert_own"
      ON public.habit_completion_days
      FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.habits h
          WHERE h.id = habit_id
            AND h.user_id = auth.uid()
        )
      )
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'habit_completion_days'
      AND policyname = 'habit_completion_days_update_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "habit_completion_days_update_own"
      ON public.habit_completion_days
      FOR UPDATE
      TO authenticated
      USING (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.habits h
          WHERE h.id = habit_id
            AND h.user_id = auth.uid()
        )
      )
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.habits h
          WHERE h.id = habit_id
            AND h.user_id = auth.uid()
        )
      )
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'habit_completion_days'
      AND policyname = 'habit_completion_days_delete_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "habit_completion_days_delete_own"
      ON public.habit_completion_days
      FOR DELETE
      TO authenticated
      USING (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.habits h
          WHERE h.id = habit_id
            AND h.user_id = auth.uid()
        )
      )
    $pol$;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.refresh_habit_completion_stats(target_habit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_day date;
  latest_completed_at timestamptz;
  current_streak int := 0;
  longest_streak int := 0;
  prev_day date;
  run_length int := 0;
BEGIN
  SELECT completion_day, completed_at
  INTO latest_day, latest_completed_at
  FROM public.habit_completion_days
  WHERE habit_id = target_habit_id
  ORDER BY completion_day DESC, completed_at DESC
  LIMIT 1;

  -- Current streak (consecutive days ending at latest completion)
  prev_day := NULL;
  run_length := 0;
  FOR rec IN
    SELECT completion_day
    FROM public.habit_completion_days
    WHERE habit_id = target_habit_id
    ORDER BY completion_day DESC
  LOOP
    IF prev_day IS NULL THEN
      run_length := 1;
    ELSIF prev_day = rec.completion_day THEN
      CONTINUE;
    ELSIF (prev_day - rec.completion_day) = 1 THEN
      run_length := run_length + 1;
    ELSE
      EXIT;
    END IF;
    prev_day := rec.completion_day;
  END LOOP;
  current_streak := run_length;

  -- Longest streak (max consecutive block overall)
  prev_day := NULL;
  run_length := 0;
  longest_streak := 0;
  FOR rec IN
    SELECT completion_day
    FROM public.habit_completion_days
    WHERE habit_id = target_habit_id
    ORDER BY completion_day ASC
  LOOP
    IF prev_day IS NULL THEN
      run_length := 1;
    ELSIF rec.completion_day = prev_day THEN
      CONTINUE;
    ELSIF (rec.completion_day - prev_day) = 1 THEN
      run_length := run_length + 1;
    ELSE
      run_length := 1;
    END IF;
    prev_day := rec.completion_day;
    IF run_length > longest_streak THEN
      longest_streak := run_length;
    END IF;
  END LOOP;

  UPDATE public.habits
  SET
    last_completed_at = latest_completed_at,
    current_streak_days = COALESCE(current_streak, 0),
    longest_streak_days = COALESCE(longest_streak, 0)
  WHERE id = target_habit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_habit_completion_days_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target uuid;
BEGIN
  target := COALESCE(NEW.habit_id, OLD.habit_id);
  IF target IS NOT NULL THEN
    PERFORM public.refresh_habit_completion_stats(target);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS habit_completion_days_refresh
  ON public.habit_completion_days;

CREATE TRIGGER habit_completion_days_refresh
  AFTER INSERT OR UPDATE OR DELETE
  ON public.habit_completion_days
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_habit_completion_days_change();

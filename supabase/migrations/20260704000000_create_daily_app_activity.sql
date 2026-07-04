-- Per-calendar-day app activity for Analytics streak momentum.

CREATE TABLE IF NOT EXISTS public.daily_app_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_app_activity_user_date_key UNIQUE (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_app_activity_user_date
  ON public.daily_app_activity (user_id, activity_date DESC);

ALTER TABLE public.daily_app_activity ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.daily_app_activity TO authenticated;

CREATE POLICY "Users can select own daily_app_activity"
  ON public.daily_app_activity
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own daily_app_activity"
  ON public.daily_app_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own daily_app_activity"
  ON public.daily_app_activity
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Service role can manage daily_app_activity"
  ON public.daily_app_activity
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_daily_app_activity ON public.daily_app_activity;
CREATE TRIGGER set_updated_at_daily_app_activity
  BEFORE UPDATE ON public.daily_app_activity
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

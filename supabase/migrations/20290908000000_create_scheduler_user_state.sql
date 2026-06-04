-- Scheduler user state table for activity tracking and nightly cron eligibility.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_updated_at'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.set_updated_at()
      RETURNS trigger AS $body$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql
    $fn$;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.scheduler_user_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_active_at timestamptz,
  last_scheduler_run_at timestamptz,
  last_scheduler_success_at timestamptz,
  last_scheduler_error_at timestamptz,
  last_scheduler_error text,
  next_scheduler_run_after timestamptz,
  scheduler_locked_at timestamptz,
  scheduler_lock_token uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_user_state_last_active_at
  ON public.scheduler_user_state (last_active_at);

CREATE INDEX IF NOT EXISTS idx_scheduler_user_state_next_scheduler_run_after
  ON public.scheduler_user_state (next_scheduler_run_after);

CREATE INDEX IF NOT EXISTS idx_scheduler_user_state_scheduler_locked_at
  ON public.scheduler_user_state (scheduler_locked_at);

ALTER TABLE public.scheduler_user_state ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.scheduler_user_state TO authenticated;

CREATE POLICY "Users can select own scheduler_user_state"
  ON public.scheduler_user_state
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own scheduler_user_state"
  ON public.scheduler_user_state
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own scheduler_user_state"
  ON public.scheduler_user_state
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Service role can manage scheduler_user_state"
  ON public.scheduler_user_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_scheduler_user_state ON public.scheduler_user_state;
CREATE TRIGGER set_updated_at_scheduler_user_state
  BEFORE UPDATE ON public.scheduler_user_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

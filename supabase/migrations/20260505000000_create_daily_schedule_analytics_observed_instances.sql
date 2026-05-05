CREATE TABLE IF NOT EXISTS public.daily_schedule_analytics_observed_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day_key date NOT NULL,
    timezone text NOT NULL,
    day_start_utc timestamptz NOT NULL,
    day_end_utc timestamptz NOT NULL,
    schedule_instance_id uuid NOT NULL REFERENCES public.schedule_instances(id) ON DELETE CASCADE,
    source_type text NOT NULL,
    source_id uuid,
    scheduled_start_utc timestamptz,
    scheduled_end_utc timestamptz,
    duration_min integer,
    time_block_id uuid,
    day_type_time_block_id uuid,
    window_id uuid,
    observed_status text,
    first_observed_at timestamptz NOT NULL DEFAULT now(),
    last_observed_at timestamptz NOT NULL DEFAULT now(),
    observation_count integer NOT NULL DEFAULT 1,
    CONSTRAINT daily_schedule_analytics_observed_instances_user_day_schedule_instance_key
      UNIQUE (user_id, day_key, schedule_instance_id)
);

CREATE INDEX IF NOT EXISTS dsaoi_user_day_key_idx
    ON public.daily_schedule_analytics_observed_instances (user_id, day_key);

CREATE INDEX IF NOT EXISTS dsaoi_user_schedule_instance_idx
    ON public.daily_schedule_analytics_observed_instances (user_id, schedule_instance_id);

CREATE INDEX IF NOT EXISTS dsaoi_user_first_observed_at_idx
    ON public.daily_schedule_analytics_observed_instances (user_id, first_observed_at);

ALTER TABLE public.daily_schedule_analytics_observed_instances ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'daily_schedule_analytics_observed_instances'
      AND policyname = 'dsaoi_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY "dsaoi_select_own" ON public.daily_schedule_analytics_observed_instances FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'daily_schedule_analytics_observed_instances'
      AND policyname = 'dsaoi_service_role_manage'
  ) THEN
    EXECUTE 'CREATE POLICY "dsaoi_service_role_manage" ON public.daily_schedule_analytics_observed_instances FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

GRANT SELECT ON public.daily_schedule_analytics_observed_instances TO authenticated;
GRANT ALL ON public.daily_schedule_analytics_observed_instances TO service_role;

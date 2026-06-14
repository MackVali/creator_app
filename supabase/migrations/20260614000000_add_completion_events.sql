-- Completion records are the analytics source of truth for completed work.
CREATE TABLE IF NOT EXISTS public.completion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('GOAL', 'PROJECT', 'TASK', 'HABIT')),
  source_id uuid NOT NULL,
  completed_at timestamptz NOT NULL,
  schedule_instance_id uuid REFERENCES public.schedule_instances(id) ON DELETE SET NULL,
  was_scheduled boolean NOT NULL DEFAULT false,
  duration_min integer CHECK (duration_min IS NULL OR duration_min >= 0),
  time_zone text,
  productivity_day_key date,
  completion_key text NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT completion_events_user_key_unique UNIQUE (user_id, completion_key)
);

CREATE INDEX IF NOT EXISTS completion_events_user_completed_idx
  ON public.completion_events(user_id, completed_at);
CREATE INDEX IF NOT EXISTS completion_events_user_source_idx
  ON public.completion_events(user_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS completion_events_schedule_instance_idx
  ON public.completion_events(schedule_instance_id);
CREATE INDEX IF NOT EXISTS completion_events_active_idx
  ON public.completion_events(user_id, completed_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.completion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS completion_events_select_own ON public.completion_events;
CREATE POLICY completion_events_select_own ON public.completion_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS completion_events_insert_own ON public.completion_events;
CREATE POLICY completion_events_insert_own ON public.completion_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS completion_events_update_own ON public.completion_events;
CREATE POLICY completion_events_update_own ON public.completion_events
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS completion_events_delete_own ON public.completion_events;
CREATE POLICY completion_events_delete_own ON public.completion_events
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.xp_events
  ADD COLUMN IF NOT EXISTS completion_event_id uuid REFERENCES public.completion_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS xp_events_completion_event_idx
  ON public.xp_events(completion_event_id);

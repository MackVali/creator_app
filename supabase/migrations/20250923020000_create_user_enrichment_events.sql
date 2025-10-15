CREATE TABLE IF NOT EXISTS public.user_enrichment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_enrichment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_enrichment_select_own ON public.user_enrichment_events;
CREATE POLICY user_enrichment_select_own
  ON public.user_enrichment_events
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_enrichment_insert_own ON public.user_enrichment_events;
CREATE POLICY user_enrichment_insert_own
  ON public.user_enrichment_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_enrichment_delete_own ON public.user_enrichment_events;
CREATE POLICY user_enrichment_delete_own
  ON public.user_enrichment_events
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_enrichment_events_user_idx
  ON public.user_enrichment_events (user_id, created_at DESC);

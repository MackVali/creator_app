CREATE TABLE IF NOT EXISTS public.schedule_sync_pairings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sync_instance_id uuid NOT NULL REFERENCES public.schedule_instances(id) ON DELETE CASCADE,
    partner_instance_ids uuid[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS schedule_sync_pairings_instance_idx
    ON public.schedule_sync_pairings (sync_instance_id);
CREATE INDEX IF NOT EXISTS schedule_sync_pairings_user_instance_idx
    ON public.schedule_sync_pairings (user_id, sync_instance_id);

ALTER TABLE public.schedule_sync_pairings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schedule_sync_pairings'
      AND policyname = 'ssp_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY "ssp_select_own" ON public.schedule_sync_pairings FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schedule_sync_pairings'
      AND policyname = 'ssp_insert_own'
  ) THEN
    EXECUTE 'CREATE POLICY "ssp_insert_own" ON public.schedule_sync_pairings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schedule_sync_pairings'
      AND policyname = 'ssp_update_own'
  ) THEN
    EXECUTE 'CREATE POLICY "ssp_update_own" ON public.schedule_sync_pairings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schedule_sync_pairings'
      AND policyname = 'ssp_delete_own'
  ) THEN
    EXECUTE 'CREATE POLICY "ssp_delete_own" ON public.schedule_sync_pairings FOR DELETE TO authenticated USING (user_id = auth.uid())';
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.schedule_sync_pairings TO authenticated;

-- Create schedule_instances table to persist scheduled placements
CREATE TYPE IF NOT EXISTS public.schedule_instance_source_type AS ENUM ('PROJECT', 'TASK');
CREATE TYPE IF NOT EXISTS public.schedule_instance_status AS ENUM ('scheduled', 'completed', 'missed', 'canceled');

CREATE TABLE IF NOT EXISTS public.schedule_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_type public.schedule_instance_source_type NOT NULL,
    source_id uuid NOT NULL,
    window_id uuid REFERENCES public.windows(id) ON DELETE SET NULL,
    start_utc timestamptz NOT NULL,
    end_utc timestamptz NOT NULL,
    duration_min integer NOT NULL CHECK (duration_min > 0),
    status public.schedule_instance_status NOT NULL DEFAULT 'scheduled',
    weight_snapshot integer NOT NULL,
    energy_resolved text NOT NULL,
    completed_at timestamptz,
    CONSTRAINT schedule_instances_start_before_end CHECK (start_utc < end_utc)
);

CREATE INDEX IF NOT EXISTS schedule_instances_user_start_idx
    ON public.schedule_instances (user_id, start_utc);
CREATE INDEX IF NOT EXISTS schedule_instances_user_status_idx
    ON public.schedule_instances (user_id, status);
CREATE INDEX IF NOT EXISTS schedule_instances_window_idx
    ON public.schedule_instances (window_id);

ALTER TABLE public.schedule_instances ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schedule_instances'
      AND policyname IN (
        'schedule_instances_select_own',
        'schedule_instances_insert_own',
        'schedule_instances_update_own',
        'schedule_instances_delete_own'
      )
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "schedule_instances_select_own" ON public.schedule_instances';
    EXECUTE 'DROP POLICY IF EXISTS "schedule_instances_insert_own" ON public.schedule_instances';
    EXECUTE 'DROP POLICY IF EXISTS "schedule_instances_update_own" ON public.schedule_instances';
    EXECUTE 'DROP POLICY IF EXISTS "schedule_instances_delete_own" ON public.schedule_instances';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schedule_instances'
      AND policyname = 'si_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY "si_select_own" ON public.schedule_instances FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schedule_instances'
      AND policyname = 'si_insert_own'
  ) THEN
    EXECUTE 'CREATE POLICY "si_insert_own" ON public.schedule_instances FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schedule_instances'
      AND policyname = 'si_update_own'
  ) THEN
    EXECUTE 'CREATE POLICY "si_update_own" ON public.schedule_instances FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schedule_instances'
      AND policyname = 'si_delete_own'
  ) THEN
    EXECUTE 'CREATE POLICY "si_delete_own" ON public.schedule_instances FOR DELETE TO authenticated USING (user_id = auth.uid())';
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.schedule_instances TO authenticated;

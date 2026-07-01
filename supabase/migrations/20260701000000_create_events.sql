-- Create durable user-owned events for CREATOR calendar persistence.

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

CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  kind text NOT NULL DEFAULT 'EVENT',
  all_day boolean NOT NULL DEFAULT false,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  timezone text,
  start_date date,
  end_date date,
  recurrence text NOT NULL DEFAULT 'NONE',
  location_name text,
  location_address text,
  meeting_provider text,
  meeting_url text,
  blocks_time text NOT NULL DEFAULT 'DEFAULT',
  visibility text NOT NULL DEFAULT 'PRIVATE',
  notification_timing text NOT NULL DEFAULT 'NONE',
  CONSTRAINT events_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT events_end_after_start CHECK (end_at > start_at),
  CONSTRAINT events_kind_check CHECK (kind IN ('REMINDER', 'EVENT', 'MEETING', 'APPOINTMENT')),
  CONSTRAINT events_blocks_time_check CHECK (blocks_time IN ('DEFAULT', 'BLOCKS', 'FREE')),
  CONSTRAINT events_visibility_check CHECK (visibility IN ('PRIVATE', 'PUBLIC')),
  CONSTRAINT events_all_day_dates_required CHECK (
    all_day = false
    OR (start_date IS NOT NULL AND end_date IS NOT NULL)
  ),
  CONSTRAINT events_date_order_check CHECK (
    start_date IS NULL
    OR end_date IS NULL
    OR end_date >= start_date
  )
);

CREATE INDEX IF NOT EXISTS events_user_start_at_idx
  ON public.events (user_id, start_at);

CREATE INDEX IF NOT EXISTS events_user_end_at_idx
  ON public.events (user_id, end_at);

CREATE INDEX IF NOT EXISTS events_user_kind_idx
  ON public.events (user_id, kind);

DROP TRIGGER IF EXISTS events_set_updated_at ON public.events;
CREATE TRIGGER events_set_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select_own" ON public.events;
DROP POLICY IF EXISTS "events_insert_own" ON public.events;
DROP POLICY IF EXISTS "events_update_own" ON public.events;
DROP POLICY IF EXISTS "events_delete_own" ON public.events;

CREATE POLICY "events_select_own" ON public.events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "events_insert_own" ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "events_update_own" ON public.events
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "events_delete_own" ON public.events
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;

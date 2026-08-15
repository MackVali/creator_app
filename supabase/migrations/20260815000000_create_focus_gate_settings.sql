CREATE TABLE IF NOT EXISTS public.focus_gate_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  minutes_per_xp integer NOT NULL DEFAULT 5 CHECK (minutes_per_xp BETWEEN 1 AND 120),
  daily_max_minutes integer CHECK (
    daily_max_minutes IS NULL OR daily_max_minutes BETWEEN 1 AND 1440
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_focus_gate_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_focus_gate_settings_updated_at ON public.focus_gate_settings;
CREATE TRIGGER trg_focus_gate_settings_updated_at
BEFORE UPDATE ON public.focus_gate_settings
FOR EACH ROW EXECUTE FUNCTION public.set_focus_gate_settings_updated_at();

ALTER TABLE public.focus_gate_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS focus_gate_settings_select_own ON public.focus_gate_settings;
CREATE POLICY focus_gate_settings_select_own ON public.focus_gate_settings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS focus_gate_settings_insert_own ON public.focus_gate_settings;
CREATE POLICY focus_gate_settings_insert_own ON public.focus_gate_settings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS focus_gate_settings_update_own ON public.focus_gate_settings;
CREATE POLICY focus_gate_settings_update_own ON public.focus_gate_settings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

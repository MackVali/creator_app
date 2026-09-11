ALTER TABLE public.focus_gate_settings
ADD COLUMN IF NOT EXISTS baseline_minutes integer NOT NULL DEFAULT 30;

ALTER TABLE public.focus_gate_settings
DROP CONSTRAINT IF EXISTS focus_gate_settings_baseline_minutes_check;

ALTER TABLE public.focus_gate_settings
ADD CONSTRAINT focus_gate_settings_baseline_minutes_check
CHECK (baseline_minutes BETWEEN 0 AND 1440);

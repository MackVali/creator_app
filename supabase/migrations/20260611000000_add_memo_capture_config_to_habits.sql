ALTER TABLE public.habits
ADD COLUMN IF NOT EXISTS memo_capture_config jsonb DEFAULT '{}'::jsonb;

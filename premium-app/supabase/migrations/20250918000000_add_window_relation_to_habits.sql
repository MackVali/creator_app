-- Add optional window relation to habits
ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS window_id uuid REFERENCES public.windows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS habits_window_id_idx
    ON public.habits (window_id);

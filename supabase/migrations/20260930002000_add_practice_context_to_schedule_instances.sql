-- Track which practice context (monument) each scheduled instance belongs to so
-- scheduling and analytics can reason about context rotation.

ALTER TABLE public.schedule_instances
  ADD COLUMN IF NOT EXISTS practice_context_monument_id uuid
  REFERENCES public.monuments(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS schedule_instances_practice_context_monument_id_idx
  ON public.schedule_instances(practice_context_monument_id);

-- Allow habits to defer their next due date.
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS next_due_override timestamptz;

CREATE INDEX IF NOT EXISTS habits_next_due_override_idx
  ON public.habits (next_due_override)
  WHERE next_due_override IS NOT NULL;

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS recurrence_days integer[];

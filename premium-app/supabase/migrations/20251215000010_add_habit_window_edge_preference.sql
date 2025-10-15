-- Add support for scheduling habits from the front or back of a window
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS window_edge_preference text DEFAULT 'FRONT';

UPDATE public.habits
SET window_edge_preference = 'FRONT'
WHERE window_edge_preference IS NULL;

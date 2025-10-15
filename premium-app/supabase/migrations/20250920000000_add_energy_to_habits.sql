ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS energy text;

UPDATE public.habits AS h
SET energy = COALESCE(UPPER(w.energy), 'NO')
FROM public.windows AS w
WHERE h.window_id = w.id
  AND (h.energy IS NULL OR h.energy = '');

UPDATE public.habits
SET energy = 'NO'
WHERE energy IS NULL OR TRIM(energy) = '';

UPDATE public.habits
SET window_id = NULL
WHERE window_id IS NOT NULL;

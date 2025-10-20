-- Ensure windows reference saved location contexts instead of storing arbitrary text.
ALTER TABLE public.windows
    ADD COLUMN IF NOT EXISTS location_context_id uuid REFERENCES public.location_contexts(id) ON DELETE SET NULL;

-- Backfill the relation based on any existing text values.
UPDATE public.windows AS w
SET location_context_id = lc.id
FROM public.location_contexts AS lc
WHERE w.location_context_id IS NULL
  AND w.location_context IS NOT NULL
  AND length(trim(w.location_context)) > 0
  AND upper(trim(w.location_context)) = lc.value
  AND w.user_id = lc.user_id;

-- Drop the legacy text column now that the relation is established.
ALTER TABLE public.windows
    DROP COLUMN IF EXISTS location_context;

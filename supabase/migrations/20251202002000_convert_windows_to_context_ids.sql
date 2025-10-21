-- Convert window location contexts to foreign keys referencing shared contexts.
-- Adds a location_context_id column, backfills based on existing values, and
-- removes the legacy text column in favor of the normalized reference.

ALTER TABLE public.windows
    ADD COLUMN IF NOT EXISTS location_context_id uuid REFERENCES public.location_contexts(id) ON DELETE SET NULL;

WITH matched AS (
    SELECT w.id,
           lc.id AS context_id
    FROM public.windows AS w
    JOIN public.location_contexts AS lc
      ON lc.user_id = w.user_id
     AND upper(trim(w.location_context)) = lc.value
    WHERE w.location_context IS NOT NULL
      AND length(trim(w.location_context)) > 0
)
UPDATE public.windows AS w
SET location_context_id = matched.context_id
FROM matched
WHERE w.id = matched.id
  AND (w.location_context_id IS DISTINCT FROM matched.context_id OR w.location_context_id IS NULL);

CREATE INDEX IF NOT EXISTS windows_location_context_id_idx
    ON public.windows (location_context_id);

ALTER TABLE public.windows
    DROP COLUMN IF EXISTS location_context;

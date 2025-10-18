-- Ensure habit and window location_context values align with the canonical
-- location_contexts table and enforce referential integrity so both entities
-- share the same option set per user.

-- Normalize blank strings to NULL for easier constraint handling.
UPDATE public.habits
SET location_context = NULL
WHERE location_context IS NOT NULL
  AND length(trim(location_context)) = 0;

UPDATE public.windows
SET location_context = NULL
WHERE location_context IS NOT NULL
  AND length(trim(location_context)) = 0;

-- Standardize stored contexts to trimmed uppercase values.
UPDATE public.habits
SET location_context = upper(trim(location_context))
WHERE location_context IS NOT NULL
  AND location_context <> upper(trim(location_context));

UPDATE public.windows
SET location_context = upper(trim(location_context))
WHERE location_context IS NOT NULL
  AND location_context <> upper(trim(location_context));

-- Seed any missing location context rows referenced by habits or windows.
WITH habit_contexts AS (
    SELECT DISTINCT
        h.user_id,
        h.location_context AS value,
        initcap(lower(h.location_context)) AS label
    FROM public.habits h
    WHERE h.location_context IS NOT NULL
      AND h.user_id IS NOT NULL
),
window_contexts AS (
    SELECT DISTINCT
        w.user_id,
        w.location_context AS value,
        initcap(lower(w.location_context)) AS label
    FROM public.windows w
    WHERE w.location_context IS NOT NULL
      AND w.user_id IS NOT NULL
),
combined AS (
    SELECT * FROM habit_contexts
    UNION
    SELECT * FROM window_contexts
)
INSERT INTO public.location_contexts (user_id, value, label)
SELECT user_id,
       value,
       label
FROM combined
WHERE value IS NOT NULL
ON CONFLICT (user_id, value) DO NOTHING;

-- Create supporting indexes to keep the upcoming foreign keys efficient.
CREATE INDEX IF NOT EXISTS habits_user_location_context_idx
    ON public.habits (user_id, location_context);

CREATE INDEX IF NOT EXISTS windows_user_location_context_idx
    ON public.windows (user_id, location_context);

-- Enforce that habit and window contexts reference a valid entry.
ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_location_context_fkey;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_location_context_fkey
        FOREIGN KEY (user_id, location_context)
        REFERENCES public.location_contexts (user_id, value)
        ON DELETE SET NULL;

ALTER TABLE public.windows
    DROP CONSTRAINT IF EXISTS windows_location_context_fkey;
ALTER TABLE public.windows
    ADD CONSTRAINT windows_location_context_fkey
        FOREIGN KEY (user_id, location_context)
        REFERENCES public.location_contexts (user_id, value)
        ON DELETE SET NULL;

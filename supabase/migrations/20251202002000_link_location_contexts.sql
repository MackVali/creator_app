-- Align existing habit and window records with the canonical location_contexts
-- table so both entities only reference standardized context values.

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

-- Seed any missing canonical values referenced by habits or windows.
WITH habit_contexts AS (
    SELECT DISTINCT
        upper(trim(h.location_context)) AS value,
        initcap(lower(trim(h.location_context))) AS label
    FROM public.habits h
    WHERE h.location_context IS NOT NULL
),
window_contexts AS (
    SELECT DISTINCT
        upper(trim(w.location_context)) AS value,
        initcap(lower(trim(w.location_context))) AS label
    FROM public.windows w
    WHERE w.location_context IS NOT NULL
),
combined AS (
    SELECT * FROM habit_contexts
    UNION
    SELECT * FROM window_contexts
)
INSERT INTO public.location_contexts (value, label)
SELECT value,
       label
FROM combined
WHERE value IS NOT NULL
  AND value <> ''
ON CONFLICT (value) DO NOTHING;

-- Index context usage for efficient lookups when enforcing referential integrity.
CREATE INDEX IF NOT EXISTS habits_location_context_idx
    ON public.habits (location_context);

CREATE INDEX IF NOT EXISTS windows_location_context_idx
    ON public.windows (location_context);

-- Ensure habits and windows only point at known contexts.
ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_location_context_fkey;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_location_context_fkey
        FOREIGN KEY (location_context)
        REFERENCES public.location_contexts (value)
        ON DELETE SET NULL;

ALTER TABLE public.windows
    DROP CONSTRAINT IF EXISTS windows_location_context_fkey;
ALTER TABLE public.windows
    ADD CONSTRAINT windows_location_context_fkey
        FOREIGN KEY (location_context)
        REFERENCES public.location_contexts (value)
        ON DELETE SET NULL;

-- Create a shared table for saved location contexts so scheduling features
-- can reference consistent values across windows and habits.
CREATE TABLE IF NOT EXISTS public.location_contexts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    value text NOT NULL,
    label text NOT NULL
);

-- Maintain updated_at automatically when rows change.
CREATE OR REPLACE FUNCTION public.set_location_contexts_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS location_contexts_set_updated_at ON public.location_contexts;
CREATE TRIGGER location_contexts_set_updated_at
    BEFORE UPDATE ON public.location_contexts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_location_contexts_updated_at();

-- Ensure each saved context value is unique globally.
ALTER TABLE public.location_contexts
    DROP CONSTRAINT IF EXISTS location_contexts_value_key;
ALTER TABLE public.location_contexts
    ADD CONSTRAINT location_contexts_value_key UNIQUE (value);

-- Enable row level security and allow authenticated users to manage contexts.
ALTER TABLE public.location_contexts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "location_contexts_select_own" ON public.location_contexts;
DROP POLICY IF EXISTS "location_contexts_insert_own" ON public.location_contexts;
DROP POLICY IF EXISTS "location_contexts_update_own" ON public.location_contexts;
DROP POLICY IF EXISTS "location_contexts_delete_own" ON public.location_contexts;
DROP POLICY IF EXISTS "location_contexts_select_authenticated" ON public.location_contexts;
DROP POLICY IF EXISTS "location_contexts_insert_authenticated" ON public.location_contexts;
DROP POLICY IF EXISTS "location_contexts_update_authenticated" ON public.location_contexts;
DROP POLICY IF EXISTS "location_contexts_delete_authenticated" ON public.location_contexts;

CREATE POLICY "location_contexts_select_authenticated" ON public.location_contexts
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "location_contexts_insert_authenticated" ON public.location_contexts
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "location_contexts_update_authenticated" ON public.location_contexts
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "location_contexts_delete_authenticated" ON public.location_contexts
    FOR DELETE
    TO authenticated
    USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_contexts TO authenticated;

-- Seed default contexts so common values exist immediately.
INSERT INTO public.location_contexts (value, label)
VALUES
    ('HOME', 'Home'),
    ('WORK', 'Work'),
    ('OUTSIDE', 'Outside')
ON CONFLICT (value) DO NOTHING;

-- Backfill any contexts already referenced by habits or windows.
WITH habit_contexts AS (
    SELECT DISTINCT
        upper(trim(h.location_context)) AS value,
        initcap(lower(trim(h.location_context))) AS label
    FROM public.habits h
    WHERE h.location_context IS NOT NULL
      AND length(trim(h.location_context)) > 0
),
window_contexts AS (
    SELECT DISTINCT
        upper(trim(w.location_context)) AS value,
        initcap(lower(trim(w.location_context))) AS label
    FROM public.windows w
    WHERE w.location_context IS NOT NULL
      AND length(trim(w.location_context)) > 0
),
combined AS (
    SELECT value,
           COALESCE(NULLIF(label, ''), value) AS label
    FROM habit_contexts
    UNION
    SELECT value,
           COALESCE(NULLIF(label, ''), value) AS label
    FROM window_contexts
)
INSERT INTO public.location_contexts (value, label)
SELECT value,
       label
FROM combined
WHERE value IS NOT NULL
  AND value <> ''
ON CONFLICT (value) DO NOTHING;

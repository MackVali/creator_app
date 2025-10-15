-- Create a dedicated table for per-user location contexts so advanced scheduling
-- can reference custom locations beyond the defaults.
CREATE TABLE IF NOT EXISTS public.location_contexts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Ensure each user has unique context values.
ALTER TABLE public.location_contexts
    DROP CONSTRAINT IF EXISTS location_contexts_user_value_key;
ALTER TABLE public.location_contexts
    ADD CONSTRAINT location_contexts_user_value_key UNIQUE (user_id, value);

-- Index contexts by owner for fast lookups.
CREATE INDEX IF NOT EXISTS location_contexts_user_id_idx
    ON public.location_contexts (user_id);

-- Enable row level security and scope access to the owner.
ALTER TABLE public.location_contexts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "location_contexts_select_own" ON public.location_contexts;
DROP POLICY IF EXISTS "location_contexts_insert_own" ON public.location_contexts;
DROP POLICY IF EXISTS "location_contexts_update_own" ON public.location_contexts;
DROP POLICY IF EXISTS "location_contexts_delete_own" ON public.location_contexts;

CREATE POLICY "location_contexts_select_own" ON public.location_contexts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "location_contexts_insert_own" ON public.location_contexts
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "location_contexts_update_own" ON public.location_contexts
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "location_contexts_delete_own" ON public.location_contexts
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_contexts TO authenticated;

-- Seed default contexts for every existing user.
INSERT INTO public.location_contexts (user_id, value, label)
SELECT users.id,
       defaults.value,
       defaults.label
FROM auth.users AS users
CROSS JOIN (VALUES
    ('HOME', 'Home'),
    ('WORK', 'Work'),
    ('OUTSIDE', 'Outside'),
    ('SLEEP', 'Sleep')
) AS defaults(value, label)
ON CONFLICT (user_id, value) DO NOTHING;

-- Backfill any contexts already referenced by habits or windows.
WITH habit_contexts AS (
    SELECT DISTINCT
        h.user_id,
        upper(trim(h.location_context)) AS value,
        initcap(lower(trim(h.location_context))) AS label
    FROM public.habits h
    WHERE h.location_context IS NOT NULL
      AND length(trim(h.location_context)) > 0
),
window_contexts AS (
    SELECT DISTINCT
        w.user_id,
        upper(trim(w.location_context)) AS value,
        initcap(lower(trim(w.location_context))) AS label
    FROM public.windows w
    WHERE w.location_context IS NOT NULL
      AND length(trim(w.location_context)) > 0
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
  AND value <> ''
ON CONFLICT (user_id, value) DO NOTHING;

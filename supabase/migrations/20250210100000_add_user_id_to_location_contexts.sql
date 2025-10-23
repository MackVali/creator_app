-- Align location_contexts with application expectations by adding the user scope
-- column and constraints that newer code relies on.

-- 1. Add the missing user_id column if it does not already exist.
ALTER TABLE public.location_contexts
    ADD COLUMN IF NOT EXISTS user_id uuid;

-- 2. Backfill user ownership from habits that reference each context.
UPDATE public.location_contexts AS lc
SET user_id = h.user_id
FROM public.habits AS h
WHERE h.location_context_id = lc.id
  AND lc.user_id IS NULL
  AND h.user_id IS NOT NULL;

-- 3. Fill in any remaining contexts from windows that reference them.
UPDATE public.location_contexts AS lc
SET user_id = w.user_id
FROM public.windows AS w
WHERE w.location_context_id = lc.id
  AND lc.user_id IS NULL
  AND w.user_id IS NOT NULL;

-- 4. Drop orphaned contexts that still lack an owner after the backfill. These
-- rows are unusable by row-level security policies and would block the NOT NULL
-- constraint below. Comment this block out if you prefer to investigate them
-- manually before removal.
DELETE FROM public.location_contexts AS lc
WHERE lc.user_id IS NULL;

-- 5. Enforce the new ownership constraint and index for faster lookups.
ALTER TABLE public.location_contexts
    ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.location_contexts
    ADD CONSTRAINT location_contexts_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE;

ALTER TABLE public.location_contexts
    DROP CONSTRAINT IF EXISTS location_contexts_user_value_key;

ALTER TABLE public.location_contexts
    ADD CONSTRAINT location_contexts_user_value_key
        UNIQUE (user_id, value);

CREATE INDEX IF NOT EXISTS location_contexts_user_id_idx
    ON public.location_contexts(user_id);

-- 6. Ensure row level security policies exist so each user only accesses their
-- own contexts. Replace existing policies to avoid duplicates.
ALTER TABLE public.location_contexts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "location_contexts_select_own" ON public.location_contexts;
CREATE POLICY "location_contexts_select_own" ON public.location_contexts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "location_contexts_insert_own" ON public.location_contexts;
CREATE POLICY "location_contexts_insert_own" ON public.location_contexts
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "location_contexts_update_own" ON public.location_contexts;
CREATE POLICY "location_contexts_update_own" ON public.location_contexts
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "location_contexts_delete_own" ON public.location_contexts;
CREATE POLICY "location_contexts_delete_own" ON public.location_contexts
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- 7. Seed default contexts for any users that still lack the common values.
INSERT INTO public.location_contexts (user_id, value, label)
SELECT users.id,
       defaults.value,
       defaults.label
FROM auth.users AS users
CROSS JOIN (VALUES
    ('HOME', 'Home'),
    ('WORK', 'Work'),
    ('OUTSIDE', 'Outside')
) AS defaults(value, label)
ON CONFLICT (user_id, value) DO NOTHING;

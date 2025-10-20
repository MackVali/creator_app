-- Create a canonical source of location context options shared by habits and
-- windows. Each row represents a unique context value along with a human
-- friendly label so both entities pick from the same standardized list.
CREATE TABLE IF NOT EXISTS public.location_contexts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    value text NOT NULL,
    label text NOT NULL
);

-- Keep values unique after normalization.
ALTER TABLE public.location_contexts
    DROP CONSTRAINT IF EXISTS location_contexts_value_key;
ALTER TABLE public.location_contexts
    ADD CONSTRAINT location_contexts_value_key UNIQUE (value);

-- Normalize stored values/labels and maintain updated_at automatically.
CREATE OR REPLACE FUNCTION public.normalize_location_context()
RETURNS trigger AS $$
BEGIN
    NEW.value = upper(trim(COALESCE(NEW.value, '')));
    IF NEW.value = '' THEN
        RAISE EXCEPTION 'location context value cannot be empty';
    END IF;

    NEW.label = trim(COALESCE(NEW.label, ''));
    IF NEW.label = '' THEN
        NEW.label = initcap(lower(NEW.value));
    END IF;

    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at = now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS location_contexts_normalize ON public.location_contexts;
CREATE TRIGGER location_contexts_normalize
    BEFORE INSERT OR UPDATE ON public.location_contexts
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_location_context();

-- Enable row level security and allow authenticated users to read/write the
-- shared list of options.
ALTER TABLE public.location_contexts ENABLE ROW LEVEL SECURITY;

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

-- Seed the default contexts that the product expects out of the box.
INSERT INTO public.location_contexts (value, label)
VALUES
    ('HOME', 'Home'),
    ('WORK', 'Work'),
    ('OUTSIDE', 'Outside')
ON CONFLICT (value) DO UPDATE SET label = EXCLUDED.label;

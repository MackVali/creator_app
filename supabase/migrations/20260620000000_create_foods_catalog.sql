-- Create the shared CREATOR Nutrition foods catalog foundation.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_updated_at'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.set_updated_at()
      RETURNS trigger AS $body$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql
    $fn$;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  brand_name text,
  normalized_brand_name text,
  barcode text,
  normalized_barcode text,
  serving_size numeric,
  serving_unit text,
  serving_grams numeric,
  calories numeric,
  carbs_g numeric,
  protein_g numeric,
  fat_g numeric,
  source text NOT NULL DEFAULT 'catalog',
  external_source text,
  external_id text,
  dedupe_key text,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT foods_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT foods_normalized_name_not_blank CHECK (length(btrim(normalized_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS foods_normalized_barcode_unique_idx
  ON public.foods(normalized_barcode);

CREATE UNIQUE INDEX IF NOT EXISTS foods_external_source_id_unique_idx
  ON public.foods(external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS foods_dedupe_key_unique_idx
  ON public.foods(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dedupe_key <> '';

CREATE INDEX IF NOT EXISTS foods_active_normalized_name_idx
  ON public.foods(is_active, normalized_name);

CREATE INDEX IF NOT EXISTS foods_active_normalized_brand_name_idx
  ON public.foods(is_active, normalized_brand_name)
  WHERE normalized_brand_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS foods_active_name_brand_idx
  ON public.foods(is_active, name, brand_name);

DROP TRIGGER IF EXISTS foods_set_updated_at ON public.foods;
CREATE TRIGGER foods_set_updated_at
  BEFORE UPDATE ON public.foods
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "foods_select_active" ON public.foods;
CREATE POLICY "foods_select_active" ON public.foods
  FOR SELECT TO authenticated
  USING (is_active = true);

REVOKE ALL ON public.foods FROM anon, authenticated;
GRANT SELECT ON public.foods TO authenticated;
GRANT ALL ON public.foods TO service_role;

WITH starter_foods(
  name,
  normalized_name,
  brand_name,
  normalized_brand_name,
  serving_size,
  serving_unit,
  serving_grams,
  calories,
  carbs_g,
  protein_g,
  fat_g,
  dedupe_key
) AS (
  VALUES
    ('Banana', 'banana', null, null, 1, 'medium', 118, 105, 27, 1.3, 0.4, 'catalog:banana:118'),
    ('Egg', 'egg', null, null, 1, 'large', 50, 72, 0.4, 6.3, 4.8, 'catalog:egg:50'),
    ('Chicken Breast', 'chicken breast', null, null, 100, 'g', 100, 165, 0, 31, 3.6, 'catalog:chicken breast:100'),
    ('White Rice', 'white rice', null, null, 1, 'cup cooked', 158, 205, 44.5, 4.3, 0.4, 'catalog:white rice:158'),
    ('Oats', 'oats', null, null, 0.5, 'cup dry', 40, 150, 27, 5, 3, 'catalog:oats:40'),
    ('Peanut Butter', 'peanut butter', null, null, 2, 'tbsp', 32, 190, 7, 8, 16, 'catalog:peanut butter:32')
)
INSERT INTO public.foods (
  name,
  normalized_name,
  brand_name,
  normalized_brand_name,
  serving_size,
  serving_unit,
  serving_grams,
  calories,
  carbs_g,
  protein_g,
  fat_g,
  source,
  dedupe_key,
  is_active
)
SELECT
  name,
  normalized_name,
  brand_name,
  normalized_brand_name,
  serving_size,
  serving_unit,
  serving_grams,
  calories,
  carbs_g,
  protein_g,
  fat_g,
  'catalog',
  dedupe_key,
  true
FROM starter_foods
ON CONFLICT DO NOTHING;
